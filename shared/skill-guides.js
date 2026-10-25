import {UTILITY_RULES} from './combat-kits.js';
const roles={
 cone:'전방 부채꼴 내 적들을 베어냅니다.',mark:'적에게 표식을 쌓아 연계 스킬의 피해를 높입니다.',blast:'목표 지점에 폭발 피해를 줍니다.',dash:'적에게 돌진하며 타격합니다.',combo:'연타로 연계 자원을 쌓습니다.',field:'지속 피해 구역을 남깁니다.',sunder:'적의 방어를 무너뜨립니다.',spin:'자신을 중심으로 무기를 연속 회전합니다.',life:'공격하며 체력을 회복합니다.',stagger:'적을 경직시킵니다.',pierce:'직선상의 적을 관통합니다.',ignite:'화상을 쌓고 폭발시킵니다.',freeze:'적을 둔화시킵니다.',resonance:'음률을 축적합니다.',chain:'연쇄 전격으로 복수 적을 공격합니다.',pull:'적을 끌어당깁니다.',slow:'적의 움직임을 둔화시킵니다.',drain:'적의 생명력을 흡수합니다.',push:'적을 밀쳐냅니다.',command:'아군을 지휘해 강화합니다.',delayed:'잠시 뒤 큰 피해를 줍니다.',healing:'아군을 회복시킵니다.',execute:'체력이 낮은 적을 마무리합니다.',summon:'소환물이 적을 자동 공격합니다.',
 counter:'방어 자세와 반격 준비',parry:'받아치기 자세',bastion:'방벽 설치와 도발',leap_trap:'뒤로 도약해 덫 설치',smoke:'연막과 분신',blink:'순간이동',aim:'집중 조준',fury:'광폭화',meditate:'명상과 기력 축적',stance:'태세 변경',brew:'촉매 조합',rewind:'시간 되감기',rebirth:'치명적인 공격을 견디는 불씨',song:'아군 강화 연주',trap:'지뢰 설치',pet:'소환수 배치',turret:'자동 포탑 설치',healing_field:'지속 치유 영역',frost_field:'빙벽·감속 구역',star_field:'성좌 표식 구역',lightning_rod:'연쇄 번개 장치',charge:'돌진과 충격파'
};
export function skillGuide(skill,job){
 if(!skill)return {summary:'',tags:[]};
 const action=skill.actionId||'',role=skill.role||'weapon',tags=[];
 let summary=roles[role]||skill.desc||'기본 전투 동작';
 if(skill.id==='basic')summary='장착 무기로 기본 공격합니다. 직업의 고유 연계 자원을 축적합니다.';
 if(role==='fury'&&job==='berserker')summary='14초 동안 광폭화합니다. 공격이 실제로 적에게 적중할 때마다 최대 체력 4%를 소모하지만, 스스로 체력을 최대 체력 30% 아래로 낮추지는 않습니다. 현재 체력이 낮을수록 피해량이 증가합니다. 몬스터에게 맞으면 30% 아래로 내려가거나 사망할 수 있습니다.';
 if(action==='bloodspin')summary='망치를 몸 주위로 연속 회전해 반경 130 내 적들을 공격합니다. 평타와 다른 광역 회전기입니다.';
 if(action==='build_turret')summary='대상 지역에 자동 포탑을 13초간 설치합니다. 포탑이 약 1.25초마다 범위 내 적을 공격합니다.';
 if(action==='skeleton_servant')summary='해골 하수인을 소환해 12초 동안 인접한 적을 자동 공격하게 합니다.';
 if(action==='rewind')summary='몇 초 전의 위치와 체력·마나를 되돌리고 주요 기술 재사용 대기시간을 일부 초기화합니다.';
 const status=(key,name)=>{if(action===key)tags.push(name);};
 for(const id of ['poison_vines','acid_flask','thorn_bloom','abyss_bind'])status(id,'독 · 5초 지속 피해');
 for(const id of ['ignite','firestorm','dragon_breath','flaming_wings','flame_mine'])status(id,'화상 · 4초 지속 피해');
 for(const id of ['chain_lightning','thunder_domain','storm_rod'])status(id,'마비 · 일반 몬스터 0.9초');
 for(const id of ['shield_bash','rune_break','earthquake','royal_command'])status(id,'기절 · 일반 몬스터 0.8초');
 if(['freeze','slow','frost_field'].includes(role))tags.push('둔화');
 if(role==='fury')tags.push('광폭화 · 공격력 상승 / 체력 소모');
 if(role==='song'||role==='command')tags.push('아군 강화');
 if(role==='healing_field'||role==='healing'||role==='rebirth')tags.push('회복·생존');
 if(role==='mark')tags.push('표식 연계');
 if(role==='turret'||role==='pet'||role==='summon')tags.push('설치·소환');
 if(skill.dot?.kind)tags.push(skill.dot.kind==='burn'?'화상 지속 피해':'독 지속 피해');
 return {summary,tags:[...new Set(tags)],power:skill.power||0,mp:skill.mp||0,cd:skill.cd||0,range:skill.range||0};
}
