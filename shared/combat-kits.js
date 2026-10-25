/** V5 active combat kit registry. Distinct play loops, not a renamed Q-attack/E-heal/R-attack template.
 * Q is a tactical strike, E is an interaction/utility verb, R is a class payoff.
 * Keys & class IDs remain compatible with existing accounts and saves.
 */
export const KIT_ROWS = [
// id                   Q                 E                  R
 ['guardian',           'cleave',          'guard_counter',     'taunt_banner'],
 ['ranger',             'hunt_mark',       'leap_trap',         'arrow_rain'],
 ['mage',               'arcane_bomb',     'mana_blink',        'meteor'],
 ['rogue',              'backstab',        'smoke_step',        'dagger_frenzy'],
 ['priest',             'judgement',       'prayer_circle',     'sanctuary'],
 ['lancer',             'charge',          'spear_parry',       'piercing_line'],
 ['monk',               'combo_strike',    'meditation',        'hundred_fists'],
 ['herbalist',          'poison_vines',    'herb_garden',       'thorn_bloom'],
 ['miner',              'armor_crack',     'rock_mine',         'earthquake'],
 ['berserker',          'bloodspin',       'blood_oath',        'berserk_frenzy'],
 ['paladin',            'holy_cut',        'aegis_sanctuary',   'holy_crusade'],
 ['sentinel',           'shield_bash',     'fortress',          'wall_of_steel'],
 ['sniper',             'piercing_shot',   'focus_aim',         'deadeye'],
 ['beastwarden',        'wolf_mark',       'summon_wolf',       'pack_hunt'],
 ['spellblade',         'rune_combo',      'rune_switch',       'triple_rune'],
 ['pyromancer',         'ignite',          'flame_mine',       'firestorm'],
 ['cryomancer',         'frost_lance',     'ice_wall',         'blizzard'],
 ['druid',              'seed_strike',     'tree_of_life',     'root_prison'],
 ['bard',               'discord',        'battle_song',      'grand_chorus'],
 ['alchemist',          'acid_flask',      'alchemical_brew',  'transmutation'],
 ['engineer',           'gearbomb',        'build_turret',     'overclock'],
 ['rune_knight',        'rune_slam',       'rune_bastion',     'rune_break'],
 ['shadowdancer',       'shadow_blades',   'mirror_step',      'shadow_festival'],
 ['stormcaller',        'chain_lightning', 'storm_rod',        'thunder_domain'],
 ['necromancer',        'soul_hook',       'skeleton_servant', 'death_legion'],
 ['chronomancer',       'time_rift',       'rewind',           'time_collapse'],
 ['spiritwalker',       'spirit_arrow',    'stance_cycle',     'seasonal_ritual'],
 ['dragonknight',       'dragon_charge',  'dragon_wings',     'dragon_breath'],
 ['stargazer',          'constellation',  'star_beacon',      'supernova'],
 ['warlord',            'command_slash',  'war_banner',       'war_charge'],
 ['voidwalker',         'rift_cut',       'void_blink',       'void_collapse'],
 ['eclipse_reaper',     'soul_reap',       'eclipse_dash',     'crescent_execution'],
 ['phoenix_heir',       'flaming_wings',   'phoenix_heart',    'rebirth_nova'],
 ['tide_oracle',        'tidal_push',      'tidal_pool',       'tidal_surge'],
 ['starweaver',         'fate_thread',     'weave_threads',    'fate_constellation'],
 ['nameless_king',      'royal_command',  'royal_guard',      'kings_judgement'],
 ['dawn_architect',     'sun_ray',        'solar_turret',     'dawn_machine'],
 ['abyss_shepherd',     'abyss_bind',      'shade_pack',       'abyss_procession']
];
export const KITS=Object.freeze(Object.fromEntries(KIT_ROWS.map(([id,q,e,r])=>[id,Object.freeze({basic:'basic',skill1:q,skill2:e,ultimate:r})])));
// E: targeted functionality; these do NOT all become generic shields/heals.
export const UTILITY_RULES=Object.freeze({
 guard_counter:{type:'counter',detail:'방어 자세·도발 후 반격'}, leap_trap:{type:'leap_trap',detail:'뒤로 뛰며 감속 덫 설치'},
 mana_blink:{type:'blink',detail:'안전한 공간으로 순간이동·마나 회복'},smoke_step:{type:'smoke',detail:'연막을 남기고 기습 위치로 이동'},
 prayer_circle:{type:'healing_field',detail:'주변 동료를 지속 치유하는 성역'},spear_parry:{type:'parry',detail:'창을 세워 공격을 막고 다음 일격 강화'},
 meditation:{type:'meditate',detail:'연타 기력 축적·체력 회복'},herb_garden:{type:'healing_field',detail:'약초 정원을 심어 지속 치유'},
 rock_mine:{type:'trap',detail:'지뢰 설치·적 진입 시 폭파'},blood_oath:{type:'fury',detail:'체력을 대가로 폭주 상태 돌입'},
 aegis_sanctuary:{type:'healing_field',detail:'파티 보호막과 치유 성역'},fortress:{type:'bastion',detail:'철벽 구축·주변 적 도발'},
 focus_aim:{type:'aim',detail:'제자리 집중·다음 사격 관통 강화'},summon_wolf:{type:'pet',detail:'늑대 동료를 소환해 자동 공격'},
 rune_switch:{type:'stance',detail:'화염·서리 룬 속성 교체'},flame_mine:{type:'trap',detail:'화염 지뢰 설치·폭발 화상'},
 ice_wall:{type:'frost_field',detail:'빙벽 설치·지속 둔화와 피해'},tree_of_life:{type:'healing_field',detail:'세계수 소환·동료 지속 치유'},
 battle_song:{type:'song',detail:'전투 노래로 파티 속도·사기 강화'},alchemical_brew:{type:'brew',detail:'촉매 혼합·회복과 다음 폭발 강화'},
 build_turret:{type:'turret',detail:'자동 톱니 포탑 설치'},rune_bastion:{type:'bastion',detail:'룬 장벽·적 도발과 파동'},
 mirror_step:{type:'smoke',detail:'분신을 남기고 적 뒤로 이동'},storm_rod:{type:'lightning_rod',detail:'피뢰침 설치·주변 적 연쇄 낙뢰'},
 skeleton_servant:{type:'pet',detail:'해골 하수인을 소환해 자동 공격'},rewind:{type:'rewind',detail:'몇 초 전 체력과 위치를 되감음'},
 stance_cycle:{type:'stance',detail:'치유형·공격형 정령 태세 교체'},dragon_wings:{type:'charge',detail:'용의 날개로 돌진·광역 충격'},
 star_beacon:{type:'star_field',detail:'성좌 표식 설치·지속 피해'},war_banner:{type:'song',detail:'전장의 깃발·파티 전투력 강화'},
 void_blink:{type:'blink',detail:'공허 공간이동·다음 공격 강화'},eclipse_dash:{type:'charge',detail:'낫을 휘두르며 접근·흡혈'},
 phoenix_heart:{type:'rebirth',detail:'불사조 불씨·치명타 한 번 방지'},tidal_pool:{type:'healing_field',detail:'조수의 샘·동료 치유와 적 둔화'},
 weave_threads:{type:'star_field',detail:'별실 매듭·적에게 운명 표식'},royal_guard:{type:'counter',detail:'왕의 수호·도발과 반격'},
 solar_turret:{type:'turret',detail:'태양 자동포 설치·범위 발사'},shade_pack:{type:'pet',detail:'그림자 무리 소환·적 추격'}
});
const Q_CLASSES={cleave:'cone',hunt_mark:'mark',arcane_bomb:'blast',backstab:'dash',judgement:'mark',charge:'dash',combo_strike:'combo',poison_vines:'field',armor_crack:'sunder',bloodspin:'spin',holy_cut:'life',shield_bash:'stagger',piercing_shot:'pierce',wolf_mark:'mark',rune_combo:'combo',ignite:'ignite',frost_lance:'freeze',seed_strike:'field',discord:'resonance',acid_flask:'field',gearbomb:'blast',rune_slam:'sunder',shadow_blades:'combo',chain_lightning:'chain',soul_hook:'pull',time_rift:'slow',spirit_arrow:'mark',dragon_charge:'dash',constellation:'mark',command_slash:'stagger',rift_cut:'dash',soul_reap:'drain',flaming_wings:'spin',tidal_push:'push',fate_thread:'mark',royal_command:'stagger',sun_ray:'pierce',abyss_bind:'pull'};
const R_CLASSES={taunt_banner:'command',arrow_rain:'field',meteor:'delayed',dagger_frenzy:'combo',sanctuary:'healing',piercing_line:'pierce',hundred_fists:'combo',thorn_bloom:'field',earthquake:'stagger',berserk_frenzy:'combo',holy_crusade:'healing',wall_of_steel:'command',deadeye:'execute',pack_hunt:'summon',triple_rune:'combo',firestorm:'field',blizzard:'field',root_prison:'stagger',grand_chorus:'healing',transmutation:'blast',overclock:'summon',rune_break:'stagger',shadow_festival:'combo',thunder_domain:'field',death_legion:'summon',time_collapse:'slow',seasonal_ritual:'healing',dragon_breath:'field',supernova:'blast',war_charge:'command',void_collapse:'blast',crescent_execution:'execute',rebirth_nova:'healing',tidal_surge:'push',fate_constellation:'mark',kings_judgement:'execute',dawn_machine:'summon',abyss_procession:'summon'};
export const Q_ACTIONS=Object.freeze(Q_CLASSES);
export const R_ACTIONS=Object.freeze(R_CLASSES);
const DESCRIPTIONS={
 cone:'전방 부채꼴 참격',mark:'표식 축적·궁극기에 연계',blast:'목표 지점 폭파',dash:'돌진 후 타격',combo:'연속 타격과 연계',field:'지속 피해 구역',sunder:'방어력 약화',spin:'근접 회전 난격',life:'공격과 생명력 회복',stagger:'밀쳐내기와 경직',pierce:'원거리 관통',ignite:'화상 축적·폭발',freeze:'결빙 중첩',resonance:'음률 중첩',chain:'연쇄 전격',pull:'적을 당기기',slow:'시간 둔화',drain:'생명력 흡수',push:'적을 밀어내기',command:'적 도발·아군 강화',delayed:'예고 후 강력한 폭발',healing:'적 타격과 파티 치유',execute:'남은 체력이 낮은 적 처형',summon:'소환물 연속 공격'};
export function applyCombatKits(CLASSES){
 for(const [job,kit] of Object.entries(KITS)){
  const c=CLASSES[job];if(!c)throw Error(`Missing class ${job}`);
  const [basic,q,e,r]=c.skills;
  basic.role='weapon';basic.desc=`${basic.name} · ${job==='sniper'?'조준용 표식':job==='monk'?'삼연타 연계':job==='eclipse_reaper'?'영혼 축적':'고유 전투 자원 축적'} · 기본 공격`;
  q.role=Q_ACTIONS[kit.skill1];q.actionId=kit.skill1;
  q.desc=`${q.name} · ${DESCRIPTIONS[q.role]||'특화 전투'} · 공격력 ${Math.round(q.power*100)}%`;
  // Dedicated active utility: distinct motion, target, area, allies and timed effects.
  e.role=UTILITY_RULES[kit.skill2].type;e.actionId=kit.skill2;
  e.power=0;e.heal=0;e.shield=0;e.partyHeal=false;e.haste=0;
  e.desc=`${e.name} · ${UTILITY_RULES[kit.skill2].detail}`;
  e.icon=({counter:'shield',parry:'shield',bastion:'shield',blink:'boot',leap_trap:'boot',smoke:'boot',charge:'sword',aim:'bow',fury:'slash',meditate:'leaf',stance:'orb',brew:'potion',rewind:'orb',rebirth:'nova',song:'leaf',trap:'shard',pet:'orb',turret:'orb',healing_field:'leaf',frost_field:'shard',star_field:'star',lightning_rod:'arrow'})[e.role]||'orb';
  r.role=R_ACTIONS[kit.ultimate];r.actionId=kit.ultimate;
  r.desc=`${r.name} · ${DESCRIPTIONS[r.role]||'고유 궁극기'} · 공격력 ${Math.round(r.power*100)}%`;
  if(['field','healing','summon','command'].includes(r.role))r.radius=Math.max(r.radius||0,145);
  // Distinguish the targeted Q from the class payoff R, including their AoE footprint.
  if(q.role==='pierce'){q.radius=0;q.range=Math.max(q.range,365);}
  if(q.role==='dash'){q.range=Math.max(115,Math.min(q.range,220));q.radius=50;}
  if(q.role==='mark'||q.role==='execute')q.radius=0;
  if(q.role==='spin'){q.center='self';q.radius=130;}
  if(q.role==='pull'||q.role==='push')q.radius=Math.min(q.radius||0,100);
 }
}
