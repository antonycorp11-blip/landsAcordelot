import { BATTLE, CAMERA, CLAIM, QUALITY, SAVE, TIME } from './config/balance';
import { TUTORIAL_STEPS, UNIT_DEFS } from './data/defs';
import { AIManager } from './managers/AIManager';
import { ArmyManager, stackSize, type MarchCheck, type UnitStack } from './managers/ArmyManager';
import { BattleManager, type BattlePreview } from './managers/BattleManager';
import { CouncilManager } from './managers/CouncilManager';
import { RealmManager } from './managers/RealmManager';
import { BuildingManager } from './managers/BuildingManager';
import { Camera } from './managers/Camera';
import { EconomyManager } from './managers/EconomyManager';
import { SaveManager } from './managers/SaveManager';
import { TradeManager } from './managers/TradeManager';
import { TerritoryManager } from './managers/TerritoryManager';
import { Renderer } from './render/Renderer';
import { createWorld, expandWorld, MAX_WAVES } from './state';
import type {
  Army,
  Battle,
  BuildingKind,
  ConquestReason,
  GameState,
  ResourceKind,
  Territory,
  UnitKind,
  Vec2,
} from './types';
import { pointInPolygon } from './world/geometry';
import type { BuiltWorld } from './world/WorldBuilder';

/**
 * Game — dono do loop, da simulação e do input do mapa (§75).
 * A UI React apenas assina o estado; nada de setInterval por entidade.
 */

export interface GameSnapshot {
  state: GameState;
  selectedId: string | null;
  selectedBuildingId: string | null;
  selectedArmyId: string | null;
  armyTargets: Set<string>;
  dragTargetId: string | null;
  hoveredId: string | null;
  claimable: Set<string>;
  fps: number;
  message: string | null;
  /** Sobe a cada mudança relevante para forçar re-render da UI. */
  revision: number;
}

type Listener = (s: GameSnapshot) => void;

export class Game {
  readonly state: GameState;
  world: BuiltWorld;
  readonly camera: Camera;
  readonly territories: TerritoryManager;
  readonly economy: EconomyManager;
  readonly buildings: BuildingManager;
  readonly armies: ArmyManager;
  readonly battles: BattleManager;
  readonly ai: AIManager;
  readonly trade: TradeManager;
  readonly realm: RealmManager;
  readonly council: CouncilManager;
  readonly saves: SaveManager;

  private renderer: Renderer | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private raf = 0;
  private simTimer: number | null = null;
  private lastSimTs = 0;
  private lastTs = 0;
  private time = 0;
  private dpr = 1;
  private fps = 60;
  /** Fator de resolução interna; cai sozinho se o quadro sofrer. */
  private qualityScale = 1;
  private lowFpsFor = 0;
  private readonly coarsePointer =
    typeof window !== 'undefined' && (window.matchMedia?.('(pointer: coarse)').matches ?? false);
  private uiTimer = 0;
  private revision = 0;
  private message: string | null = null;
  private messageTimer = 0;
  private listeners = new Set<Listener>();

  selectedId: string | null = null;
  hoveredId: string | null = null;
  claimable = new Set<string>();
  /** Depósito em foco na aba de construção (destacado no mapa). */
  focusedDepositId: string | null = null;
  /** Construção selecionada no mapa (abre o cartão de detalhe). */
  selectedBuildingId: string | null = null;
  /** Exército selecionado no mapa e para onde ele pode ir. */
  selectedArmyId: string | null = null;
  armyTargets = new Set<string>();
  /** Ponta do arrasto em curso, para a linha elástica. */
  dragTo: Vec2 | null = null;
  dragTargetId: string | null = null;
  /** Aba que o painel deve abrir na próxima seleção (vem de cliques no mapa). */
  requestedTab: 'view' | 'build' | 'work' | 'army' | 'trade' | 'borders' | null = null;

  constructor() {
    const bundle = createWorld();
    this.state = bundle.state;
    this.world = bundle.world;
    this.camera = new Camera(this.world.width, this.world.height);
    this.territories = new TerritoryManager(this.state);
    this.economy = new EconomyManager(this.state);
    this.buildings = new BuildingManager(this.state, this.economy);
    this.armies = new ArmyManager(this.state, this.economy, this.world);
    this.battles = new BattleManager(this.state);
    this.ai = new AIManager(this.state, this.economy, this.buildings, this.armies, this.battles);
    this.trade = new TradeManager(this.state);
    this.realm = new RealmManager(this.state);
    this.council = new CouncilManager(this.state);
    this.saves = new SaveManager();
  }

  // -- ciclo de vida --------------------------------------------------------

  /**
   * Prepara o armazenamento e carrega o progresso. Precisa ser aguardado antes
   * do `attach`, senão o jogo começaria do zero por cima de um save existente.
   */
  async boot(): Promise<void> {
    await this.saves.init();
    this.loadSave();
  }

  /**
   * Grava agora. O iOS encerra o app sem avisar, então salvamos ao esconder a
   * aba e ao sair — `beforeunload` não é confiável lá.
   */
  private saveOnHide = () => {
    if (document.visibilityState === 'hidden') this.saves.save(this.state);
  };

  attach(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.renderer = new Renderer(this.world, this.camera);
    this.resize();

    const capital = this.playerCapital();
    if (capital) this.camera.jumpTo(capital.center, CAMERA.startZoom);

    // Gancho de depuração: console do navegador enxerga o jogo (§78).
    if (import.meta.env.DEV) {
      (window as unknown as { __game?: Game }).__game = this;
    }

    this.lastTs = performance.now();
    this.lastSimTs = performance.now();

    // Renderização: preso ao requestAnimationFrame.
    const loop = (ts: number) => {
      this.raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (ts - this.lastTs) / 1000);
      this.lastTs = ts;
      this.renderFrame(dt);
    };
    this.raf = requestAnimationFrame(loop);

    document.addEventListener('visibilitychange', this.saveOnHide);
    window.addEventListener('pagehide', this.saveOnHide);

    // Simulação: relógio de parede em intervalo próprio. Assim o reino continua
    // vivo com a aba em segundo plano e recupera o tempo perdido ao voltar.
    this.simTimer = window.setInterval(() => this.simulateFromClock(), TIME.simIntervalMs);
  }

  detach() {
    // Um jogo que nunca foi ligado ao canvas não tem progresso a gravar. Sem
    // esta guarda, o descarte do React em desenvolvimento grava um reino
    // recém-criado por cima do save de verdade.
    const wasAttached = this.canvas !== null;
    cancelAnimationFrame(this.raf);
    document.removeEventListener('visibilitychange', this.saveOnHide);
    window.removeEventListener('pagehide', this.saveOnHide);
    if (this.simTimer !== null) {
      clearInterval(this.simTimer);
      this.simTimer = null;
    }
    if (wasAttached) this.saves.save(this.state);
    this.renderer = null;
    this.ctx = null;
    this.canvas = null;
  }

  resize() {
    if (!this.canvas || !this.ctx) return;
    const rect = this.canvas.getBoundingClientRect();
    const maxDpr = this.coarsePointer ? QUALITY.maxDprMobile : QUALITY.maxDprDesktop;
    this.dpr = Math.min(maxDpr, window.devicePixelRatio || 1) * this.qualityScale;
    this.canvas.width = Math.max(1, Math.round(rect.width * this.dpr));
    this.canvas.height = Math.max(1, Math.round(rect.height * this.dpr));
    this.camera.setViewport(rect.width, rect.height);
  }

  /**
   * Se o quadro ficar abaixo do aceitável por alguns segundos, baixamos a
   * resolução interna em vez de deixar o jogo travando (§40/§67).
   */
  private adaptQuality(dt: number) {
    if (this.fps >= QUALITY.minFps || this.qualityScale <= QUALITY.minScale) {
      this.lowFpsFor = 0;
      return;
    }
    this.lowFpsFor += dt;
    if (this.lowFpsFor < QUALITY.dropAfterSeconds) return;
    this.lowFpsFor = 0;
    this.qualityScale = Math.max(QUALITY.minScale, this.qualityScale - QUALITY.scaleStep);
    this.resize();
  }

  // -- simulação ------------------------------------------------------------

  /** Um quadro de vídeo: câmera, animações e desenho. Não move a economia. */
  private renderFrame(dt: number) {
    this.camera.update(dt);
    this.time += dt;

    if (this.renderer) {
      this.renderer.hoveredId = this.hoveredId;
      this.renderer.selectedId = this.selectedId;
      this.renderer.claimableIds = this.claimable;
      this.renderer.focusedDepositId = this.focusedDepositId;
      this.renderer.selectedBuildingId = this.selectedBuildingId;
      this.renderer.selectedArmyId = this.selectedArmyId;
      this.renderer.armyTargets = this.armyTargets;
      this.renderer.dragTo = this.dragTo;
      this.renderer.dragTargetId = this.dragTargetId;
      this.renderer.update(dt);
      if (this.ctx) this.renderer.draw(this.ctx, this.state, this.time, this.dpr);
    }

    this.fps = this.fps * 0.92 + (1 / Math.max(dt, 0.0001)) * 0.08;
    this.adaptQuality(dt);
    if (this.messageTimer > 0) {
      this.messageTimer -= dt;
      if (this.messageTimer <= 0) {
        this.message = null;
        this.emit();
      }
    }

    this.uiTimer += dt;
    if (this.uiTimer >= 1 / 6) {
      this.uiTimer = 0;
      this.emit();
    }
  }

  /**
   * Avança a simulação pelo tempo REAL decorrido desde a última chamada.
   * Ausências longas são recuperadas em blocos (com teto), o que dá progresso
   * offline sem permitir saltos absurdos.
   */
  private simulateFromClock() {
    const now = performance.now();
    let real = (now - this.lastSimTs) / 1000;
    this.lastSimTs = now;
    if (real <= 0) return;
    real = Math.min(real, TIME.maxCatchUpSeconds);

    let simDt = real * this.state.time.speed;
    if (simDt <= 0) return;

    while (simDt > 0) {
      const chunk = Math.min(simDt, TIME.maxSimChunk);
      this.simulate(chunk);
      simDt -= chunk;
    }
    this.emit();
  }

  private simulate(simDt: number) {
    this.state.time.elapsed += simDt;
    this.state.time.day = 1 + Math.floor(this.state.time.elapsed / TIME.secondsPerDay);

    this.economy.tick(simDt);

    for (const done of this.armies.tickTraining(simDt)) {
      if (done.ownerId !== this.state.playerKingdomId) continue;
      this.state.stats.unitsTrained++;
      const where = this.state.territories[done.territoryId]?.name ?? '';
      this.notify(`${UNIT_DEFS[done.unit].name} pronto em ${where}.`, 2.5);
    }

    for (const army of this.armies.tickMovement(simDt)) this.onArrival(army);
    for (const battle of this.battles.tick(simDt)) this.settleBattle(battle);

    this.trade.tick(simDt);
    this.ai.tick(simDt);
    this.checkRealm();

    // O conselho traz uma demanda: o jogo pausa e espera a decisão.
    const demand = this.council.tick(simDt);
    if (demand) {
      this.setSpeed(0);
      this.touch();
    }
    this.saves.tick(simDt, this.state);
    this.advanceTutorial();
  }

  /** Sobe de título e abre entradas da crônica quando o mundo merece. */
  private checkRealm() {
    const bonus = this.realm.bonus();
    this.economy.wageFactor = 1 - bonus.wageCut;
    this.economy.titleStorage = bonus.storage;
    this.economy.policyProduction = bonus.production;
    this.armies.policyTrainSpeed = bonus.trainSpeed;
    this.armies.policyMorale = bonus.morale;
    this.armies.policyMarchSpeed = bonus.marchSpeed;
    this.battles.policyDefense = bonus.defense;
    this.trade.policySpread = bonus.tradeSpread;

    // Todo o mapa sob uma bandeira: abre a fundação do Estado (§5).
    if (this.realm.shouldPromoteToState() && !this.state.promotionPending) {
      this.state.promotionPending = true;
      this.setSpeed(0);
      this.touch();
    }
    const promoted = this.realm.checkPromotion();
    if (promoted) {
      this.notify(`Novo título: ${promoted.name.toUpperCase()} — ${promoted.scale}.`, 6);
      this.touch();
    }
    for (const entry of this.realm.checkMilestones()) {
      this.notify(`Crônica: ${entry.title}`, 5);
      this.touch();
    }
  }

  /** Funda o Estado a partir da tela de promoção. */
  foundState(
    name: string,
    governorId: string,
    generalId: string,
    civilPolicy: GameState['civilPolicy'],
    warPolicy: GameState['warPolicy'],
  ) {
    this.realm.foundState(name, governorId, generalId, civilPolicy, warPolicy);
    // Fundar o Estado é o momento em que o mapa deixa de terminar na borda:
    // os primeiros vizinhos aparecem, e com eles a fronteira volta a existir.
    const grew = this.revealNextWave();
    this.notify(
      grew
        ? `O Estado de ${this.state.stateName} está fundado. O mapa cresceu.`
        : `O Estado de ${this.state.stateName} está fundado.`,
      8,
    );
    this.setSpeed(1);
    this.touch();
  }

  /** Responde a demanda aberta do conselho. */
  decide(optionIndex: number) {
    const option = this.council.decide(optionIndex);
    if (!option) return;
    this.notify(option.reply, 6);
    this.setSpeed(1);
    this.touch();
  }

  /** Troca a ordem dada ao governador (cidade, povo, extração). */
  setCivilPolicy(policy: GameState['civilPolicy']) {
    if (this.state.civilPolicy === policy) return;
    this.state.civilPolicy = policy;
    this.notify('Nova ordem enviada ao governador.', 3);
    this.touch();
  }

  /** Troca a ordem dada ao general (tropa e fronteira). */
  setWarPolicy(policy: GameState['warPolicy']) {
    if (this.state.warPolicy === policy) return;
    this.state.warPolicy = policy;
    this.notify('Nova ordem enviada ao general.', 3);
    this.touch();
  }

  /** Define a vocação de uma cidade sua. */
  setVocation(territoryId: string, vocation: Territory['vocation']): boolean {
    const t = this.state.territories[territoryId];
    if (!t || t.ownerId !== this.state.playerKingdomId) return false;
    if (t.vocation === vocation) return false;
    t.vocation = vocation;
    this.notify(`${t.name}: vocação definida.`, 2.5);
    this.touch();
    return true;
  }

  /** Abre uma entrada de crônica disparada por um evento. */
  chronicle(id: string) {
    const entry = this.realm.record(id);
    if (entry) this.notify(`Crônica: ${entry.title}`, 5);
  }

  // -- chegada de coluna ----------------------------------------------------

  /** A coluna chegou: junta-se à guarnição amiga ou abre batalha. */
  private onArrival(army: Army) {
    const targetId = army.targetTerritoryId ?? army.homeTerritoryId;
    const target = this.state.territories[targetId];
    if (!target) {
      delete this.state.armies[army.id];
      return;
    }

    if (target.ownerId === army.ownerId) {
      this.armies.mergeIntoGarrison(army, targetId);
      if (army.ownerId === this.state.playerKingdomId && army.state === 'returning') {
        this.notify(`Coluna recolhida em ${target.name}.`, 2.5);
      }
      this.touch();
      return;
    }

    const battle = this.battles.start(army, targetId);
    if (army.ownerId === this.state.playerKingdomId) this.chronicle('first_battle');
    const isPlayer =
      army.ownerId === this.state.playerKingdomId || target.ownerId === this.state.playerKingdomId;
    if (isPlayer) {
      const attacking = army.ownerId === this.state.playerKingdomId;
      this.notify(
        attacking
          ? `Batalha em ${target.name}!`
          : `${this.state.kingdoms[army.ownerId]?.name ?? 'Um inimigo'} ataca ${target.name}!`,
        4,
      );
      this.camera.focus(battle.position, Math.max(this.camera.zoom, 0.85));
    }
    this.touch();
  }

  // -- fim de batalha -------------------------------------------------------

  /**
   * Aplica o resultado. A troca de dono passa pela mesma porta genérica de
   * sempre — aqui com motivo MILITARY (§19).
   */
  private settleBattle(battle: Battle) {
    const territory = this.state.territories[battle.territoryId];
    const attackerArmy = this.state.armies[battle.attacker.armyIds[0]];
    const playerInvolved =
      battle.attacker.kingdomId === this.state.playerKingdomId ||
      battle.defender.kingdomId === this.state.playerKingdomId;

    // Defensores viram uma guarnição única com os sobreviventes.
    for (const id of battle.defender.armyIds) delete this.state.armies[id];

    if (battle.winner === 'attacker' && territory && attackerArmy) {
      const previousOwner = territory.ownerId;
      this.territories.transferOwnership(battle.territoryId, attackerArmy.ownerId, 'MILITARY');

      attackerArmy.state = 'garrison';
      attackerArmy.territoryId = battle.territoryId;
      attackerArmy.homeTerritoryId = battle.territoryId;
      attackerArmy.targetTerritoryId = null;
      attackerArmy.battleId = null;
      attackerArmy.path = null;
      attackerArmy.units = battle.attacker.units;
      attackerArmy.morale = Math.max(30, battle.attacker.morale);
      attackerArmy.name = `Guarnição de ${territory.name}`;
      attackerArmy.position = this.armies.garrisonPosition(battle.territoryId);
      if (stackSize(attackerArmy.units) === 0) delete this.state.armies[attackerArmy.id];

      const castle = territory.castleId ? this.state.castles[territory.castleId] : null;
      if (castle) castle.hp = Math.max(castle.maxHp * 0.35, castle.maxHp * 0.6);

      if (attackerArmy.ownerId === this.state.playerKingdomId) {
        this.state.stats.battlesWon++;
        this.state.stats.territoriesTaken++;
        this.chronicle('first_conquest');
        this.renderer?.overlay.addEffect({
          kind: 'conquest',
          x: battle.position.x,
          y: battle.position.y,
          color: this.playerKingdom.color,
        });
        this.territories.refreshLocks(this.state.playerKingdomId);
        this.notify(`VITÓRIA! ${territory.name.toUpperCase()} é seu.`, 5);
        this.select(battle.territoryId);
      } else if (previousOwner === this.state.playerKingdomId) {
        this.state.stats.battlesLost++;
        this.state.stats.territoriesLost++;
        this.chronicle('lost_land');
        this.notify(`DERROTA: ${territory.name.toUpperCase()} caiu.`, 6);
      } else {
        // Conquista entre terceiros: entra no diário do mundo, sem interromper.
        const conqueror = this.state.kingdoms[attackerArmy.ownerId]?.name ?? 'Um reino';
        this.ai.journal.push(`${conqueror} tomou ${territory.name}.`);
        if (this.ai.journal.length > 12) this.ai.journal.shift();
      }
    } else if (attackerArmy) {
      // Derrota do atacante: parte da tropa recua para casa.
      const survivors: UnitStack = {};
      for (const kind of Object.keys(battle.attacker.units) as UnitKind[]) {
        const n = Math.floor((battle.attacker.units[kind] ?? 0) * BATTLE.retreatSurvival);
        if (n > 0) survivors[kind] = n;
      }
      // Defensores sobreviventes voltam a ser a guarnição.
      if (stackSize(battle.defender.units) > 0 && territory?.ownerId) {
        const garrison = this.armies.ensureGarrison(battle.territoryId);
        if (garrison) {
          garrison.units = battle.defender.units;
          garrison.morale = Math.max(25, battle.defender.morale);
        }
      }

      if (stackSize(survivors) > 0) {
        attackerArmy.units = survivors;
        attackerArmy.morale = Math.max(20, battle.attacker.morale);
        attackerArmy.battleId = null;
        this.armies.recall(attackerArmy.id);
      } else {
        delete this.state.armies[attackerArmy.id];
      }

      if (battle.attacker.kingdomId === this.state.playerKingdomId) {
        this.state.stats.battlesLost++;
        this.chronicle('first_defeat');
        this.notify(`Ataque a ${territory?.name ?? 'inimigo'} fracassou.`, 5);
      } else if (battle.defender.kingdomId === this.state.playerKingdomId) {
        this.state.stats.battlesWon++;
        this.notify(`Ataque a ${territory?.name ?? 'seu território'} rechaçado!`, 5);
      }
    } else if (stackSize(battle.defender.units) > 0 && territory?.ownerId) {
      const garrison = this.armies.ensureGarrison(battle.territoryId);
      if (garrison) garrison.units = battle.defender.units;
    }

    delete this.state.battles[battle.id];
    if (playerInvolved) this.saves.save(this.state);
    this.touch();
  }

  // -- assinatura para o React ----------------------------------------------

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.snapshot());
    return () => this.listeners.delete(fn);
  }

  snapshot(): GameSnapshot {
    return {
      state: this.state,
      selectedId: this.selectedId,
      selectedBuildingId: this.selectedBuildingId,
      selectedArmyId: this.selectedArmyId,
      armyTargets: this.armyTargets,
      dragTargetId: this.dragTargetId,
      hoveredId: this.hoveredId,
      claimable: this.claimable,
      fps: this.fps,
      message: this.message,
      revision: this.revision,
    };
  }

  private emit() {
    const snap = this.snapshot();
    for (const l of this.listeners) l(snap);
  }

  /** Marca que algo mudou de verdade (a UI relê tudo). */
  private touch() {
    this.revision++;
    this.advanceTutorial();
    this.emit();
  }

  notify(msg: string, seconds = 3.5) {
    this.message = msg;
    this.messageTimer = seconds;
    this.emit();
  }

  // -- consultas ------------------------------------------------------------

  /** Data do reino: dia, estação e ano, derivados do tempo decorrido. */
  calendar(): { day: number; season: string; year: number } {
    const total = this.state.time.day - 1;
    const seasons = ['Primavera', 'Verão', 'Outono', 'Inverno'];
    const seasonIndex = Math.floor(total / TIME.daysPerSeason) % 4;
    const year = TIME.startYear + Math.floor(total / (TIME.daysPerSeason * 4));
    return {
      day: (total % TIME.daysPerSeason) + 1,
      season: seasons[seasonIndex],
      year,
    };
  }

  get playerKingdom() {
    return this.state.kingdoms[this.state.playerKingdomId];
  }

  playerCapital(): Territory | null {
    const capId = this.playerKingdom.capitalTerritoryId;
    return capId ? (this.state.territories[capId] ?? null) : null;
  }

  territoryAt(worldPoint: Vec2): Territory | null {
    for (const t of Object.values(this.state.territories)) {
      if (t.polygon.length > 2 && pointInPolygon(worldPoint, t.polygon)) return t;
    }
    return null;
  }

  ownedTerritories(): Territory[] {
    return Object.values(this.state.territories).filter(
      (t) => t.ownerId === this.state.playerKingdomId,
    );
  }

  // -- input ----------------------------------------------------------------

  hoverAt(screenX: number, screenY: number) {
    const t = this.territoryAt(this.camera.screenToWorld(screenX, screenY));
    const id = t?.id ?? null;
    if (id !== this.hoveredId) {
      this.hoveredId = id;
      this.emit();
    }
  }

  select(id: string | null) {
    const changed = id !== this.selectedId;
    this.selectedId = id;
    if (changed) {
      this.focusedDepositId = null;
      this.selectedBuildingId = null;
      this.selectedArmyId = null;
      this.armyTargets = new Set();
    }
    this.claimable = new Set();
    if (id) {
      const t = this.state.territories[id];
      if (t && t.ownerId === this.state.playerKingdomId) {
        for (const n of t.neighbors) {
          if (this.territories.claimStatus(this.state.playerKingdomId, n).claimable) {
            this.claimable.add(n);
          }
        }
      }
    }
    this.touch();
  }

  /**
   * Clique no mapa. Antes de cair no território, testa o que está desenhado
   * ali: depósito livre ou construção. É o que faz o mapa responder como jogo
   * e não como um mero seletor de regiões.
   */
  selectAt(screenX: number, screenY: number) {
    const world = this.camera.screenToWorld(screenX, screenY);

    // Exército tem prioridade: é o que o jogador mais quer pegar no mapa.
    const army = this.armyAt(world);
    if (army) {
      this.selectArmy(army.id);
      return;
    }
    // Com um exército selecionado, tocar num destino aceso já é a ordem.
    if (this.selectedArmyId) {
      const t = this.territoryAt(world);
      if (t && this.armyTargets.has(t.id)) {
        this.dragTargetId = t.id;
        this.touch();
        return;
      }
      this.selectArmy(null);
    }

    // Alvo generoso: no celular o dedo não tem a precisão do mouse.
    const radius = (this.coarsePointer ? 74 : 52) / Math.max(0.4, this.camera.zoom);

    let bestBuilding: string | null = null;
    let bestDeposit: string | null = null;
    let bestDist = radius;

    for (const b of Object.values(this.state.buildings)) {
      // Prédio maior é mais fácil de acertar.
      const reach = radius * (0.75 + b.level * 0.12);
      const d = Math.hypot(b.position.x - world.x, b.position.y - world.y);
      if (d < reach && d < bestDist) {
        bestDist = d;
        bestBuilding = b.id;
        bestDeposit = null;
      }
    }
    for (const dep of Object.values(this.state.deposits)) {
      if (dep.buildingId) continue;
      const d = Math.hypot(dep.position.x - world.x, dep.position.y - world.y);
      if (d < bestDist) {
        bestDist = d;
        bestDeposit = dep.id;
        bestBuilding = null;
      }
    }

    if (bestDeposit) {
      const dep = this.state.deposits[bestDeposit];
      const owned = this.state.territories[dep.territoryId]?.ownerId === this.state.playerKingdomId;
      this.requestedTab = owned ? 'build' : 'view';
      this.select(dep.territoryId);
      this.focusedDepositId = owned ? bestDeposit : null;
      this.touch();
      return;
    }
    if (bestBuilding) {
      const b = this.state.buildings[bestBuilding];
      const owned = this.state.territories[b.territoryId]?.ownerId === this.state.playerKingdomId;
      this.requestedTab = owned ? 'work' : 'view';
      this.select(b.territoryId);
      // Selecionar depois de `select`, que limpa o foco ao trocar de território.
      this.selectedBuildingId = owned ? bestBuilding : null;
      this.touch();
      return;
    }

    const t = this.territoryAt(world);
    this.requestedTab = null;
    this.select(t?.id ?? null);
  }

  focusTerritory(id: string, zoom = 1.0) {
    const t = this.state.territories[id];
    if (!t) return;
    const castle = t.castleId ? this.state.castles[t.castleId] : null;
    this.camera.focus(castle?.position ?? t.center, zoom);
  }

  // -- exército no mapa -----------------------------------------------------

  /** Exército do jogador sob um ponto do mundo, se houver. */
  armyAt(world: Vec2): Army | null {
    const reach = (this.coarsePointer ? 78 : 56) / Math.max(0.4, this.camera.zoom);
    let best: Army | null = null;
    let bestDist = reach;
    for (const army of Object.values(this.state.armies)) {
      if (army.ownerId !== this.state.playerKingdomId) continue;
      if (army.state === 'fighting') continue;
      const d = Math.hypot(army.position.x - world.x, army.position.y - world.y);
      if (d < bestDist) {
        bestDist = d;
        best = army;
      }
    }
    return best;
  }

  /**
   * Seleciona um exército e acende os destinos válidos.
   * Vizinho próprio é reforço, vizinho alheio é ataque — a mesma marcha.
   */
  selectArmy(armyId: string | null) {
    this.selectedArmyId = armyId;
    this.armyTargets = new Set();
    this.dragTo = null;
    this.dragTargetId = null;

    const army = armyId ? this.state.armies[armyId] : null;
    if (!army || army.state !== 'garrison') {
      this.touch();
      return;
    }
    const from = this.state.territories[army.territoryId];
    if (from) {
      for (const n of from.neighbors) {
        const t = this.state.territories[n];
        if (t && !t.locked) this.armyTargets.add(n);
      }
    }
    this.touch();
  }

  /** Destino é amigo? Muda o texto e tira a prévia de batalha. */
  isFriendlyTarget(territoryId: string): boolean {
    return this.state.territories[territoryId]?.ownerId === this.state.playerKingdomId;
  }

  /** Começa o arrasto se o toque pegou um exército do jogador. */
  beginArmyDrag(screenX: number, screenY: number): boolean {
    const world = this.camera.screenToWorld(screenX, screenY);
    const army = this.armyAt(world);
    if (!army || army.state !== 'garrison') return false;
    this.selectArmy(army.id);
    this.dragTo = world;
    return true;
  }

  updateArmyDrag(screenX: number, screenY: number) {
    if (!this.selectedArmyId) return;
    const world = this.camera.screenToWorld(screenX, screenY);
    this.dragTo = world;
    const t = this.territoryAt(world);
    this.dragTargetId = t && this.armyTargets.has(t.id) ? t.id : null;
  }

  /** Solta o arrasto. Devolve o destino válido sob o dedo, se houver. */
  endArmyDrag(): string | null {
    const target = this.dragTargetId;
    this.dragTo = null;
    this.dragTargetId = null;
    this.touch();
    return target;
  }

  /** Abre a tela da construção (e leva a câmera até ela). */
  selectBuilding(buildingId: string | null) {
    this.selectedBuildingId = buildingId;
    const b = buildingId ? this.state.buildings[buildingId] : null;
    if (b) {
      this.selectedId = b.territoryId;
      this.camera.focus(b.position, Math.max(this.camera.zoom, 0.9));
    }
    this.touch();
  }

  /** Só move a câmera, sem mexer na seleção. */
  focusBuilding(buildingId: string) {
    const b = this.state.buildings[buildingId];
    if (b) this.camera.focus(b.position, Math.max(this.camera.zoom, 1.1));
  }

  focusDeposit(depositId: string | null) {
    this.focusedDepositId = depositId;
    const dep = depositId ? this.state.deposits[depositId] : null;
    if (dep) this.camera.focus(dep.position, Math.max(this.camera.zoom, 0.9));
    this.touch();
  }

  zoomBy(factor: number) {
    this.camera.zoomAt(this.camera.viewW / 2, this.camera.viewH / 2, factor);
  }

  /** Liga/desliga uma camada do mapa. */
  toggleLayer(layer: 'provinces' | 'resources' | 'routes' | 'armies') {
    if (!this.renderer) return;
    this.renderer.layers[layer] = !this.renderer.layers[layer];
    this.touch();
  }

  mapLayers() {
    return this.renderer?.layers ?? { provinces: true, resources: true, routes: true, armies: true };
  }

  setSpeed(speed: GameState['time']['speed']) {
    this.state.time.speed = speed;
    this.touch();
  }

  // -- ações de economia ----------------------------------------------------

  build(territoryId: string, defId: BuildingKind, depositId?: string): boolean {
    const t = this.state.territories[territoryId];
    if (!t) return false;
    const check = this.buildings.checkBuild(t, defId, depositId);
    if (!check.ok) {
      this.notify(check.reason);
      return false;
    }
    const b = this.buildings.build(territoryId, defId, depositId);
    if (!b) return false;
    this.state.stats.buildingsRaised++;
    this.focusedDepositId = null;
    this.notify('Obra iniciada.', 2);
    this.touch();
    return true;
  }

  upgradeBuilding(buildingId: string): boolean {
    const b = this.state.buildings[buildingId];
    if (!b) return false;
    const check = this.buildings.checkUpgrade(b);
    if (!check.ok) {
      this.notify(check.reason);
      return false;
    }
    const ok = this.buildings.upgrade(buildingId);
    if (ok) this.touch();
    return ok;
  }

  demolishBuilding(buildingId: string): boolean {
    const ok = this.buildings.demolish(buildingId);
    if (ok) {
      this.notify('Construção demolida.', 2);
      this.touch();
    }
    return ok;
  }

  hireWorker(territoryId: string): boolean {
    const t = this.state.territories[territoryId];
    if (!t) return false;
    const check = this.buildings.canHire(t);
    if (!check.ok) {
      this.notify(check.reason);
      return false;
    }
    const ok = this.buildings.hireWorker(territoryId);
    if (ok) this.touch();
    return ok;
  }

  dismissWorker(territoryId: string): boolean {
    const ok = this.buildings.dismissWorker(territoryId);
    if (ok) this.touch();
    return ok;
  }

  assignWorker(buildingId: string, delta: number): boolean {
    const ok = this.buildings.assignWorker(buildingId, delta);
    if (ok) this.touch();
    else if (delta > 0) this.notify('Sem trabalhador livre — contrate mais na aba Trabalho.');
    return ok;
  }

  // -- ações militares ------------------------------------------------------

  recruit(territoryId: string, unit: UnitKind, count = 1): boolean {
    const t = this.state.territories[territoryId];
    if (!t) return false;
    const n = Math.max(1, Math.floor(count));
    const check = this.armies.checkRecruit(t, unit, n);
    if (!check.ok) {
      this.notify(check.reason);
      return false;
    }
    const ok = this.armies.recruit(territoryId, unit, n);
    if (ok) {
      this.notify(
        n > 1 ? `${n}× ${UNIT_DEFS[unit].name} em treinamento.` : `${UNIT_DEFS[unit].name} em treinamento.`,
        2.5,
      );
      this.touch();
    }
    return ok;
  }

  cancelTraining(orderId: string): boolean {
    const ok = this.armies.cancelTraining(orderId);
    if (ok) this.touch();
    return ok;
  }

  disband(territoryId: string, unit: UnitKind): boolean {
    const ok = this.armies.disband(territoryId, unit);
    if (ok) this.touch();
    return ok;
  }

  // -- campanha militar -----------------------------------------------------

  marchCheck(fromId: string, toId: string, units: UnitStack): MarchCheck {
    return this.armies.checkMarch(fromId, toId, units);
  }

  /** Prévia honesta do combate: mostra o preço da vitória antes de marchar (§17). */
  battlePreview(units: UnitStack, morale: number, targetId: string): BattlePreview {
    return this.battles.preview(units, morale, targetId);
  }

  dispatchArmy(fromId: string, toId: string, units: UnitStack): boolean {
    const check = this.armies.checkMarch(fromId, toId, units);
    if (!check.ok) {
      this.notify(check.reason);
      return false;
    }
    const army = this.armies.dispatch(fromId, toId, units);
    if (!army) return false;
    const target = this.state.territories[toId];
    this.notify(
      `${stackSize(units)} soldados marcham sobre ${target?.name ?? 'o inimigo'} — ${Math.ceil(
        check.travelTime,
      )}s de viagem.`,
      4,
    );
    this.touch();
    return true;
  }

  recallArmy(armyId: string): boolean {
    const army = this.state.armies[armyId];
    if (!army || army.ownerId !== this.state.playerKingdomId) return false;
    const ok = this.armies.recall(armyId);
    if (ok) {
      this.notify('Coluna ordenada a recuar.', 2.5);
      this.touch();
    } else {
      this.notify('Não é possível recuar agora.');
    }
    return ok;
  }

  /** Colunas do jogador em campo — alimenta o painel de campanhas. */
  playerCampaigns(): Army[] {
    return this.armies.marchingArmies(this.state.playerKingdomId);
  }

  activeBattles(): Battle[] {
    return Object.values(this.state.battles);
  }

  focusArmy(armyId: string) {
    const army = this.state.armies[armyId];
    if (!army) return;
    this.camera.focus(army.position, Math.max(this.camera.zoom, 0.9));
    this.touch();
  }

  // -- comércio -------------------------------------------------------------

  executeTrade(territoryId: string, give: ResourceKind, amount: number, receive: ResourceKind): boolean {
    const t = this.state.territories[territoryId];
    if (!t) return false;
    const q = this.trade.quote(t, give, amount, receive);
    if (!q.ok) {
      this.notify(q.reason);
      return false;
    }
    if (!this.trade.execute(territoryId, give, amount, receive)) return false;
    this.state.stats.caravansSent++;
    this.chronicle('first_trade');
    this.notify(`Caravana partiu: ${amount} → ${q.receiveAmount}.`, 3);
    this.touch();
    return true;
  }

  // -- conquista ------------------------------------------------------------

  claimOffer(territoryId: string) {
    const t = this.state.territories[territoryId];
    const kingdom = this.playerKingdom;
    const cost = { coin: 0, food: 0 };
    if (!t) return { cost, affordable: false, available: false, reason: 'Território desconhecido.' };

    const cut = 1 - this.realm.bonus().claimCut;
    cost.coin = Math.round((CLAIM.coinBase + t.defense * CLAIM.coinPerDefense) * cut);
    cost.food = Math.round((CLAIM.foodBase + t.population * CLAIM.foodPerPop) * cut);

    const status = this.territories.claimStatus(this.state.playerKingdomId, territoryId);
    if (!status.claimable) return { cost, affordable: false, available: false, reason: status.reason };
    if (t.ownerId !== null) {
      return {
        cost,
        affordable: false,
        available: false,
        reason: 'Domínio de outro reino — exige campanha militar.',
      };
    }
    const affordable = kingdom.resources.coin >= cost.coin && kingdom.resources.food >= cost.food;
    return {
      cost,
      affordable,
      available: true,
      reason: affordable ? 'Fronteira aberta à negociação.' : 'Recursos insuficientes.',
    };
  }

  executeClaim(territoryId: string): boolean {
    const offer = this.claimOffer(territoryId);
    if (!offer.available || !offer.affordable) {
      this.notify(offer.reason);
      return false;
    }
    const kingdom = this.playerKingdom;
    kingdom.resources.coin -= offer.cost.coin;
    kingdom.resources.food -= offer.cost.food;
    const ok = this.claimTerritory(territoryId, 'ECONOMIC');
    if (ok) {
      this.state.stats.territoriesTaken++;
      this.chronicle('first_claim');
    }
    return ok;
  }

  /**
   * Ponto único de troca de dono. A batalha ligará aqui; diplomacia, religião
   * e rebelião usarão exatamente a mesma porta (§19).
   */
  claimTerritory(id: string, reason: ConquestReason): boolean {
    const kingdomId = this.state.playerKingdomId;
    const status = this.territories.claimStatus(kingdomId, id);
    if (!status.claimable && reason !== 'SCENARIO') {
      this.notify(status.reason);
      return false;
    }
    const t = this.state.territories[id];
    if (!this.territories.transferOwnership(id, kingdomId, reason)) return false;

    const castle = t.castleId ? this.state.castles[t.castleId] : null;
    const pos = castle?.position ?? t.center;
    this.renderer?.overlay.addEffect({
      kind: 'conquest',
      x: pos.x,
      y: pos.y,
      color: this.playerKingdom.color,
    });
    this.camera.focus(pos, Math.max(this.camera.zoom, 0.8));

    const unlocked = this.territories.refreshLocks(kingdomId);
    this.notify(
      unlocked.length
        ? `NOVO TERRITÓRIO: ${t.name.toUpperCase()} — região desbloqueada!`
        : `NOVO TERRITÓRIO CONQUISTADO: ${t.name.toUpperCase()}`,
    );
    this.select(id);
    this.saves.save(this.state);
    return true;
  }

  // -- tutorial -------------------------------------------------------------

  /** Cada passo é validado por estado REAL do jogo, nunca por clique fingido. */
  private tutorialSatisfied(stepId: string): boolean {
    const capital = this.playerCapital();
    const owned = this.ownedTerritories();
    const has = (kind: BuildingKind) =>
      Object.values(this.state.buildings).some(
        (b) => b.defId === kind && this.state.territories[b.territoryId]?.ownerId === this.state.playerKingdomId,
      );

    switch (stepId) {
      case 'select_capital':
        return this.selectedId === capital?.id;
      case 'open_build':
        return this.uiFlags.openedBuildTab;
      case 'build_lumberjack':
        return has('lumberjack');
      case 'hire_worker':
        return owned.some((t) =>
          t.buildingIds.some((id) => (this.state.buildings[id]?.workers ?? 0) > 0 && this.state.buildings[id]?.defId === 'lumberjack'),
        );
      case 'build_sawmill':
        return has('sawmill');
      case 'build_barracks':
        return has('barracks');
      case 'recruit':
        return Object.values(this.state.armies).some(
          (a) => a.ownerId === this.state.playerKingdomId,
        ) || this.state.training.length > 0;
      case 'claim':
        return owned.length > 1;
      case 'campaign':
        return Object.values(this.state.armies).some(
          (a) => a.ownerId === this.state.playerKingdomId && a.state !== 'garrison',
        );
      default:
        return false;
    }
  }

  /** Sinais vindos da UI que não existem no estado do mundo. */
  uiFlags = { openedBuildTab: false };

  markUiFlag(flag: keyof Game['uiFlags']) {
    if (this.uiFlags[flag]) return;
    this.uiFlags[flag] = true;
    this.touch();
  }

  /**
   * Avança o tutorial se a condição do passo foi cumprida.
   * Não emite por conta própria: quem chama decide quando notificar a UI.
   * Um `while` cobre o caso de o jogador já ter satisfeito vários passos.
   */
  private advanceTutorial() {
    if (this.state.tutorialDone) return;
    let guard = 0;
    while (guard++ < TUTORIAL_STEPS.length + 1) {
      const step = TUTORIAL_STEPS[this.state.tutorialStep];
      if (!step) {
        this.state.tutorialDone = true;
        return;
      }
      if (!this.tutorialSatisfied(step.id)) return;
      this.state.tutorialStep++;
      this.revision++;
      if (this.state.tutorialStep >= TUTORIAL_STEPS.length) {
        this.state.tutorialDone = true;
        this.notify('Tutorial concluído. O reino é seu para expandir.', 5);
        return;
      }
    }
  }

  skipTutorial() {
    this.state.tutorialDone = true;
    this.touch();
  }

  // -- save -----------------------------------------------------------------

  saveNow(): boolean {
    const ok = this.saves.save(this.state);
    this.notify(ok ? 'Reino salvo.' : 'Não foi possível salvar.');
    return ok;
  }

  loadSave(): boolean {
    // Primeiro o mapa cresce até a escala em que o save foi gravado; só então
    // o save entra. Na ordem inversa, as províncias do País ainda não existem
    // e tudo o que você conquistou lá fora seria descartado em silêncio.
    const waves = this.saves.peekWaves();
    if (waves > 0) this.rebuildWorld(waves);
    const ok = this.saves.load(this.state);
    if (ok) this.select(null);
    return ok;
  }

  /**
   * Reconstrói a geometria para um número de ondas e religa quem depende dela.
   *
   * Chamado em dois momentos: ao carregar um save que já estava no País, e na
   * hora em que o mapa cresce de verdade. A diferença entre os dois é só o
   * deslocamento — ao carregar ele dá zero, porque as posições salvas já estão
   * nas coordenadas certas.
   */
  private rebuildWorld(waves: number) {
    const { world, dx, dy } = expandWorld(this.state, waves);
    this.world = world;
    this.armies.world = world;
    this.camera.setBounds(world.width, world.height);
    this.camera.nudge(dx, dy);
    if (this.canvas) this.renderer = new Renderer(this.world, this.camera);
    this.resize();
    this.select(null);
    this.selectedArmyId = null;
    this.selectedBuildingId = null;
    this.touch();
  }

  /**
   * Revela a próxima onda de vizinhos (§5).
   *
   * O País não chega inteiro: cada onda traz os Estados que fazem fronteira
   * com o que você já domina. Devolve falso quando não há mais mundo pronto.
   */
  revealNextWave(): boolean {
    const next = this.state.waves + 1;
    if (next > MAX_WAVES) return false;
    this.rebuildWorld(next);
    this.saves.save(this.state);
    return true;
  }

  resetSave() {
    this.saves.clear();
    this.notify(`Save apagado. Recarregue para recomeçar (${SAVE.key}).`);
  }
}
