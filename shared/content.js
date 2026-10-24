import { cleanAttributes, enhancementBonus } from './rpg.js';
import { titleStatBonus } from './title-catalog.js';
import { installExtraItems } from './extra-items.js';
export { MAX_LEVEL, xpRequired } from './rpg.js';
import { installBossGear } from './visuals.js';
import { installExpeditions } from './expeditions.js';
import { installExpansion } from './expansion.js';
import { CHALLENGE_ZONES } from './challenges.js';
import { installDungeons } from './dungeons.js';
import { installRealms } from './realms.js';
import { installEncounterIdentities } from './encounters.js';
export const VERSION = '3.0.0';
export const TILE = 32;
export const CLASSES = {
  guardian: {
    name: '서약기사', short: '기사', color: '#e9bd7a', sprite: 'guardian',
    motto: '가장 어두운 곳에서, 먼저 검을 들다.',
    desc: '검과 방패로 전선을 지키는 근접 전사. 높은 체력과 보호막으로 처음 모험하는 사람에게도 든든합니다.',
    hp: 150, mp: 70, atk: 15, def: 5, speed: 155, range: 85, attackMs: 620,
    weapon: 'iron_sword',
    skills: [
      { id: 'basic', name: '검격', key: 'SPACE', icon: 'sword', cd: 620, mp: 0, power: 1, range: 85, radius: 0, unlock: 1, desc: '가까운 적을 검으로 공격합니다.' },
      { id: 'skill1', name: '반월 베기', key: 'Q', icon: 'slash', cd: 4200, mp: 12, power: 1.8, range: 115, radius: 125, unlock: 1, desc: '주변 적에게 넓은 검기를 날립니다.' },
      { id: 'skill2', name: '별빛 수호', key: 'E', icon: 'shield', cd: 11000, mp: 20, power: 0, shield: 0.3, heal: 0.1, unlock: 3, desc: '5초 동안 피해를 55% 줄이고 체력을 10% 회복합니다.' },
      { id: 'ultimate', name: '서약의 심판', key: 'R', icon: 'nova', cd: 24000, mp: 30, power: 3.5, range: 170, radius: 180, unlock: 5, desc: '주변 적에게 강한 피해를 주고 2초간 둔화시킵니다.' }
    ]
  },
  ranger: {
    name: '바람추적자', short: '궁수', color: '#8cceac', sprite: 'ranger',
    motto: '흔들리는 잎새 사이로, 길을 찾다.',
    desc: '활로 거리를 유지하며 싸우는 원거리 탐험가. 이동 속도가 빠르고 여러 적을 상대하는 데 능합니다.',
    hp: 110, mp: 85, atk: 16, def: 3, speed: 178, range: 280, attackMs: 650,
    weapon: 'oak_bow',
    skills: [
      { id: 'basic', name: '정밀 사격', key: 'SPACE', icon: 'bow', cd: 650, mp: 0, power: 1, range: 280, radius: 0, unlock: 1, desc: '선택한 적에게 화살을 날립니다.' },
      { id: 'skill1', name: '바람 화살', key: 'Q', icon: 'arrow', cd: 4500, mp: 12, power: 2.2, range: 340, radius: 65, unlock: 1, desc: '적과 그 주변을 관통하는 강한 화살입니다.' },
      { id: 'skill2', name: '숲의 숨결', key: 'E', icon: 'leaf', cd: 12000, mp: 18, power: 0, heal: 0.3, unlock: 3, desc: '체력을 30% 회복하고 잠시 이동 속도가 빨라집니다.' },
      { id: 'ultimate', name: '유성우', key: 'R', icon: 'nova', cd: 24000, mp: 32, power: 3.2, range: 330, radius: 165, unlock: 5, desc: '선택한 적 주변에 화살의 비를 내립니다.' }
    ]
  },
  mage: {
    name: '성흔술사', short: '술사', color: '#b6a0f4', sprite: 'mage',
    motto: '사라진 별의 언어를, 다시 깨우다.',
    desc: '별의 파편으로 넓은 범위를 공격하는 마법사. 마나 관리와 회피를 익히면 강력한 힘을 발휘합니다.',
    hp: 95, mp: 120, atk: 20, def: 2, speed: 160, range: 250, attackMs: 760,
    weapon: 'ash_staff',
    skills: [
      { id: 'basic', name: '별빛 탄환', key: 'SPACE', icon: 'staff', cd: 760, mp: 0, power: 1, range: 250, radius: 0, unlock: 1, desc: '적에게 응축된 별빛을 날립니다.' },
      { id: 'skill1', name: '성운 폭발', key: 'Q', icon: 'orb', cd: 5000, mp: 16, power: 2, range: 290, radius: 115, unlock: 1, desc: '적 주변을 폭발시키고 이동 속도를 늦춥니다.' },
      { id: 'skill2', name: '시간의 틈', key: 'E', icon: 'shield', cd: 12000, mp: 22, power: 0, shield: 0.3, heal: 0.18, unlock: 3, desc: '5초 동안 피해를 55% 줄이고 체력을 18% 회복합니다.' },
      { id: 'ultimate', name: '낙성', key: 'R', icon: 'nova', cd: 26000, mp: 38, power: 4, range: 310, radius: 180, unlock: 5, desc: '거대한 별을 떨어뜨려 주변 적을 타격합니다.' }
    ]
  }
};
export const RARITIES = {
  common: { name: '일반', color: '#b3c3c0' },
  uncommon: { name: '고급', color: '#77cba0' },
  rare: { name: '희귀', color: '#79b6ef' },
  epic: { name: '영웅', color: '#b698ed' },
  legendary: { name: '전설', color: '#edbb70' }
};
export const ITEMS = {
  potion: { name: '붉은 이슬 물약', type: 'consumable', icon: 'potion', rarity: 'common', desc: '최대 체력의 45%를 회복합니다. 재사용 5초.', buy: 20, sell: 5 },
  mana: { name: '푸른 이슬 물약', type: 'consumable', icon: 'mana', rarity: 'common', desc: '최대 마나의 50%를 회복합니다. 재사용 5초.', buy: 18, sell: 4 },
  herb: { name: '별잎 약초', type: 'material', icon: 'herb', rarity: 'common', desc: '물약 제작에 사용하는 은은한 향의 약초.', sell: 5 },
  wood: { name: '은가지 목재', type: 'material', icon: 'wood', rarity: 'common', desc: '무기 제작에 사용하는 단단한 목재.', sell: 5 },
  ore: { name: '달철 광석', type: 'material', icon: 'ore', rarity: 'uncommon', desc: '장비 제작과 강화에 쓰이는 광석.', sell: 9 },
  gel: { name: '맑은 점액', type: 'material', icon: 'gel', rarity: 'common', desc: '슬라임에게서 얻는 연금술 재료.', sell: 5 },
  pelt: { name: '어스름 가죽', type: 'material', icon: 'pelt', rarity: 'uncommon', desc: '늑대의 가죽. 방어구 제작 재료.', sell: 10 },
  shard: { name: '달빛 파편', type: 'material', icon: 'shard', rarity: 'rare', desc: '유적의 망령에게서 얻는 빛의 조각.', sell: 18 },
  ember: { name: '불씨 결정', type: 'material', icon: 'ember', rarity: 'rare', desc: '재의 성채에 남은 작은 불꽃.', sell: 25 },
  heart: { name: '수호자의 심장', type: 'material', icon: 'heart', rarity: 'epic', desc: '숲의 수호자가 남긴 고대의 핵.', sell: 90 },
  moon: { name: '달의 눈물', type: 'material', icon: 'moon', rarity: 'epic', desc: '달잠의 마녀가 지키던 성물.', sell: 160 },
  dragon: { name: '별을 삼킨 비늘', type: 'material', icon: 'dragon', rarity: 'legendary', desc: '검은 별의 용을 쓰러뜨린 증거.', sell: 350 },
  iron_sword: { name: '여행자의 검', type: 'gear', slot: 'weapon', class: 'guardian', icon: 'sword', rarity: 'common', atk: 2, level: 1, sell: 20 },
  oak_bow: { name: '여행자의 활', type: 'gear', slot: 'weapon', class: 'ranger', icon: 'bow', rarity: 'common', atk: 2, level: 1, sell: 20 },
  ash_staff: { name: '여행자의 지팡이', type: 'gear', slot: 'weapon', class: 'mage', icon: 'staff', rarity: 'common', atk: 2, level: 1, sell: 20 },
  moon_sword: { name: '은가지 장검', type: 'gear', slot: 'weapon', class: 'guardian', icon: 'sword', rarity: 'rare', atk: 10, level: 3, sell: 80 },
  moon_bow: { name: '은가지 장궁', type: 'gear', slot: 'weapon', class: 'ranger', icon: 'bow', rarity: 'rare', atk: 10, level: 3, sell: 80 },
  moon_staff: { name: '은가지 마도봉', type: 'gear', slot: 'weapon', class: 'mage', icon: 'staff', rarity: 'rare', atk: 12, level: 3, sell: 80 },
  star_sword: { name: '성흔의 맹세', type: 'gear', slot: 'weapon', class: 'guardian', icon: 'sword', rarity: 'epic', atk: 22, crit: 5, level: 7, sell: 240 },
  star_bow: { name: '성흔의 메아리', type: 'gear', slot: 'weapon', class: 'ranger', icon: 'bow', rarity: 'epic', atk: 22, crit: 5, level: 7, sell: 240 },
  star_staff: { name: '성흔의 속삭임', type: 'gear', slot: 'weapon', class: 'mage', icon: 'staff', rarity: 'epic', atk: 25, crit: 5, level: 7, sell: 240 },
  dawn_sword: { name: '새벽을 여는 검', type: 'gear', slot: 'weapon', class: 'guardian', icon: 'sword', rarity: 'legendary', atk: 36, crit: 10, level: 11, sell: 550 },
  dawn_bow: { name: '새벽을 부르는 활', type: 'gear', slot: 'weapon', class: 'ranger', icon: 'bow', rarity: 'legendary', atk: 36, crit: 10, level: 11, sell: 550 },
  dawn_staff: { name: '새벽을 밝히는 지팡이', type: 'gear', slot: 'weapon', class: 'mage', icon: 'staff', rarity: 'legendary', atk: 40, crit: 10, level: 11, sell: 550 },
  tunic: { name: '여행자의 망토', type: 'gear', slot: 'armor', icon: 'armor', rarity: 'common', def: 2, hp: 12, level: 1, sell: 15 },
  leather: { name: '숲지기의 외투', type: 'gear', slot: 'armor', icon: 'armor', rarity: 'uncommon', def: 5, hp: 32, level: 3, buy: 180, sell: 60 },
  moon_robe: { name: '달잠의 예복', type: 'gear', slot: 'armor', icon: 'armor', rarity: 'epic', def: 9, hp: 65, mp: 20, level: 7, sell: 220 },
  dawn_armor: { name: '새벽 수호의', type: 'gear', slot: 'armor', icon: 'armor', rarity: 'legendary', def: 14, hp: 100, level: 11, sell: 450 },
  charm: { name: '작은 별의 부적', type: 'gear', slot: 'charm', icon: 'charm', rarity: 'uncommon', hp: 15, mp: 15, level: 2, buy: 140, sell: 45 },
  moss_charm: { name: '숲의 심장 부적', type: 'gear', slot: 'charm', icon: 'charm', rarity: 'rare', hp: 30, atk: 4, level: 4, sell: 150 },
  moon_charm: { name: '달의 눈물 목걸이', type: 'gear', slot: 'charm', icon: 'charm', rarity: 'epic', hp: 40, mp: 30, crit: 6, level: 7, sell: 260 },
  dawn_charm: { name: '마지막 별의 약속', type: 'gear', slot: 'charm', icon: 'charm', rarity: 'legendary', hp: 65, atk: 10, crit: 8, level: 11, sell: 500 }
};
export const weaponFor = (tier, cls) => `${tier}_${(CLASSES[cls]?.family||cls) === 'guardian' ? 'sword' : (CLASSES[cls]?.family||cls) === 'ranger' ? 'bow' : 'staff'}`;
export const RECIPES = [
  { id: 'brew', name: '붉은 이슬 물약 × 3', output: 'potion', count: 3, gold: 8, cost: { herb: 2, gel: 1 }, level: 1 },
  { id: 'blue', name: '푸른 이슬 물약 × 3', output: 'mana', count: 3, gold: 8, cost: { herb: 2 }, level: 1 },
  { id: 'moon_weapon', name: '내 직업의 은가지 무기', weaponTier: 'moon', count: 1, gold: 80, cost: { wood: 4, ore: 3 }, level: 3 },
  { id: 'leather', name: '숲지기의 외투', output: 'leather', count: 1, gold: 70, cost: { pelt: 4, wood: 2 }, level: 3 },
  { id: 'moss', name: '숲의 심장 부적', output: 'moss_charm', count: 1, gold: 100, cost: { heart: 1, ore: 3 }, level: 4 },
  { id: 'star_weapon', name: '내 직업의 성흔 무기', weaponTier: 'star', count: 1, gold: 220, cost: { heart: 1, shard: 6, ore: 5 }, level: 7 },
  { id: 'moon_robe', name: '달잠의 예복', output: 'moon_robe', count: 1, gold: 240, cost: { moon: 1, pelt: 5, shard: 4 }, level: 7 },
  { id: 'dawn_weapon', name: '내 직업의 새벽 무기', weaponTier: 'dawn', count: 1, gold: 500, cost: { dragon: 1, ember: 8, ore: 8 }, level: 11 },
  { id: 'dawn_armor', name: '새벽 수호의', output: 'dawn_armor', count: 1, gold: 420, cost: { dragon: 1, ember: 6, pelt: 6 }, level: 11 }
];
export const MONSTERS = {
  slime: { name: '이슬 슬라임', sprite: 'slime', level: 1, hp: 45, atk: 7, def: 0, xp: 20, gold: [5, 10], speed: 62, range: 35, aggro: 115, material: 'gel' },
  beetle: { name: '반딧불 딱정벌레', sprite: 'beetle', level: 2, hp: 62, atk: 9, def: 1, xp: 27, gold: [7, 13], speed: 75, range: 38, aggro: 130, material: 'wood' },
  wolf: { name: '어스름 늑대', sprite: 'wolf', level: 3, hp: 83, atk: 13, def: 2, xp: 38, gold: [10, 17], speed: 112, range: 44, aggro: 160, material: 'pelt' },
  moss_guardian: { name: '이끼왕 · 모르가', sprite: 'moss_guardian', level: 5, hp: 1150, atk: 25, def: 4, xp: 280, gold: [90, 140], speed: 60, range: 72, aggro: 250, material: 'heart', boss: true, radius: 35 },
  skeleton: { name: '달잠의 파수병', sprite: 'skeleton', level: 5, hp: 140, atk: 18, def: 4, xp: 65, gold: [14, 23], speed: 85, range: 45, aggro: 165, material: 'ore' },
  wisp: { name: '길 잃은 별불', sprite: 'wisp', level: 6, hp: 115, atk: 21, def: 2, xp: 72, gold: [16, 25], speed: 100, range: 140, aggro: 210, material: 'shard' },
  golem: { name: '무너진 석상', sprite: 'golem', level: 7, hp: 210, atk: 23, def: 7, xp: 90, gold: [20, 28], speed: 55, range: 55, aggro: 150, material: 'ore' },
  moon_witch: { name: '달잠의 마녀 · 셀레네', sprite: 'moon_witch', level: 9, hp: 2250, atk: 39, def: 7, xp: 600, gold: [180, 240], speed: 72, range: 170, aggro: 280, material: 'moon', boss: true, radius: 28 },
  imp: { name: '불씨 도깨비', sprite: 'imp', level: 9, hp: 225, atk: 28, def: 6, xp: 120, gold: [25, 35], speed: 95, range: 120, aggro: 190, material: 'ember' },
  ash_knight: { name: '재빛 맹세기사', sprite: 'ash_knight', level: 10, hp: 315, atk: 33, def: 10, xp: 155, gold: [30, 42], speed: 90, range: 55, aggro: 190, material: 'ember' },
  eclipse_dragon: { name: '별을 삼킨 용 · 녹스', sprite: 'eclipse_dragon', level: 13, hp: 4200, atk: 52, def: 11, xp: 1200, gold: [320, 450], speed: 70, range: 95, aggro: 300, material: 'dragon', boss: true, radius: 48 }
};
export const QUESTS = [
  { id: 'first_light', name: '숲에서 온 작은 신호', chapter: '01', npc: 'lia', level: 1, desc: '숲의 이슬 슬라임들이 이상하게 거칠어졌대요. 북쪽 길을 따라 숲으로 가서, 마을 주변부터 살펴봐 주세요.', objectives: [{ kind: 'kill', target: 'slime', count: 5 }], xp: 110, gold: 80, items: { potion: 4 }, end: '고마워요. 슬라임 몸 안에도 작은 별 조각이 있었다니… 숲 깊은 곳에서 무언가 깨어나고 있나 봐요.' },
  { id: 'forest_call', name: '이상해진 숲의 숨결', chapter: '02', npc: 'lia', level: 2, requires: 'first_light', desc: '늑대들도 잠을 이루지 못하고 있어요. 어스름 늑대 5마리를 진정시키고 별잎 약초 3개를 채집해 주세요. 채집한 기록을 확인하니, 약초는 먼저 사용해도 괜찮아요.', objectives: [{ kind: 'kill', target: 'wolf', count: 5 }, { kind: 'gather', target: 'herb', count: 3 }], xp: 220, gold: 160, weaponTier: 'moon', end: '숲의 수호자가 우리를 부르고 있었군요. 이 무기가 도움이 되기를 바라요.' },
  { id: 'guardian_oath', name: '잊힌 수호자의 이름', chapter: '03', npc: 'lia', level: 4, requires: 'forest_call', desc: '숲 동쪽 원형 터의 이끼왕 모르가를 찾아주세요. 그를 쓰러뜨려 검은 별의 속박을 풀어주세요. 혼자 어렵다면 다른 모험가와 힘을 모아도 좋아요.', objectives: [{ kind: 'kill', target: 'moss_guardian', count: 1 }], xp: 400, gold: 240, items: { moss_charm: 1, potion: 5 }, end: '모르가의 기억이 돌아왔어요. 떨어진 별은 달잠 유적을 지나 재의 성채로 사라졌다고 해요.' },
  { id: 'moon_gate', name: '달잠의 문을 열다', chapter: '04', npc: 'lia', level: 5, requires: 'guardian_oath', desc: '숲 북쪽의 문을 넘어 달잠 유적으로 가주세요. 문을 지키는 파수병 7마리를 물리치고 달철 광석 4개를 채집해 주세요.', objectives: [{ kind: 'kill', target: 'skeleton', count: 7 }, { kind: 'gather', target: 'ore', count: 4 }], xp: 550, gold: 280, items: { leather: 1, mana: 5 }, end: '사람들이 떠난 뒤에도 파수병들은 약속을 지키고 있었네요. 그들의 오래된 밤을 끝내줘서 고마워요.' },
  { id: 'lost_stars', name: '별불이 기억하는 것', chapter: '05', npc: 'lia', level: 6, requires: 'moon_gate', desc: '길 잃은 별불 7마리와 무너진 석상 3기를 쓰러뜨려 유적의 길을 밝혀주세요.', objectives: [{ kind: 'kill', target: 'wisp', count: 7 }, { kind: 'kill', target: 'golem', count: 3 }], xp: 650, gold: 320, weaponTier: 'star', end: '그 빛 속에 마녀의 마지막 말이 담겨 있었어요. “별을 돌려보내 줘.” 이제 마녀를 만나야 해요.' },
  { id: 'moon_tears', name: '달이 잠들지 못한 이유', chapter: '06', npc: 'lia', level: 7, requires: 'lost_stars', desc: '달잠 유적 북동쪽 제단에서 마녀 셀레네를 구해주세요. 바닥에 새겨지는 원을 피하는 것이 중요해요.', objectives: [{ kind: 'kill', target: 'moon_witch', count: 1 }], xp: 850, gold: 400, items: { moon_charm: 1, moon_robe: 1, potion: 5 }, end: '셀레네가 남긴 별의 지도가 성채를 가리키고 있어요. 마지막 별은 아직 꺼지지 않았어요.' },
  { id: 'ash_road', name: '재가 된 맹세', chapter: '07', npc: 'lia', level: 9, requires: 'moon_tears', desc: '재의 성채에서 재빛 맹세기사 8마리와 불씨 도깨비 6마리를 물리쳐주세요.', objectives: [{ kind: 'kill', target: 'ash_knight', count: 8 }, { kind: 'kill', target: 'imp', count: 6 }], xp: 1200, gold: 550, items: { potion: 8, mana: 5 }, end: '성채의 불꽃이 조금씩 잦아들고 있어요. 이제 당신을 믿고 마지막 부탁을 할게요.' },
  { id: 'last_star', name: '마지막 별의 약속', chapter: '08', npc: 'lia', level: 11, requires: 'ash_road', desc: '성채 북쪽에서 별을 삼킨 용 녹스를 쓰러뜨려주세요. 적색 경고를 피해, 잃어버린 새벽을 되찾아 주세요.', objectives: [{ kind: 'kill', target: 'eclipse_dragon', count: 1 }], xp: 1800, gold: 1000, items: { dawn_charm: 1 }, weaponTier: 'dawn', title: '새벽을 되찾은 자', end: '봐요, 하늘이 밝아지고 있어요. 당신이 돌아올 이 마을을 지키고 있을게요. 우리의 다음 모험도 여기서 시작해요.' },
  { id: 'bounty', name: '모험가 길드의 의뢰', chapter: '반복', npc: 'lia', level: 1, repeatable: true, desc: '어느 지역이든 몬스터 12마리를 처치해 주세요. 완료한 뒤 다시 받을 수 있어요.', objectives: [{ kind: 'kill', target: 'any', count: 12 }], xp: 140, gold: 100, items: { potion: 3 }, end: '또 한 번 길이 안전해졌네요. 다음 의뢰도 부탁할게요.' }
];
export const ZONES = {
  town: { name: '별여울 마을', subtitle: '불빛이 남아 있는 곳', minLevel: 1, width: 48, height: 36, theme: 'town', color: '#edbc76', spawn: [24, 21], weather: 'fireflies', music: 'town' },
  forest: { name: '속삭이는 숲', subtitle: '낙성의 흔적을 따라서', minLevel: 1, width: 64, height: 46, theme: 'forest', color: '#88cca5', spawn: [30, 40], weather: 'leaves', music: 'forest' },
  ruins: { name: '달잠 유적', subtitle: '깨어나지 못한 기억', minLevel: 5, width: 60, height: 44, theme: 'ruins', color: '#b2a4ef', spawn: [28, 38], weather: 'stars', music: 'ruins' },
  citadel: { name: '재의 성채', subtitle: '마지막 별이 잠든 밤', minLevel: 9, width: 58, height: 44, theme: 'citadel', color: '#e9a280', spawn: [28, 38], weather: 'embers', music: 'citadel' }
};
export const NPCS = [
  { id: 'lia', name: '리아', role: '별지기 · 의뢰', kind: 'quest', sprite: 'lia', zone: 'town', x: 25.5*TILE, y: 18.5*TILE, dialog: '이 마을에서는 아직 밤에도 불을 꺼두지 않아요. 돌아오는 사람에게 길이 보이도록요. 당신도, 무사히 돌아와 주세요.' },
  { id: 'mora', name: '모라', role: '여행 상인', kind: 'shop', sprite: 'merchant', zone: 'town', x: 19.5*TILE, y: 21*TILE, dialog: '가방이 너무 가볍다고요? 그럼 물약부터 챙겨요. 별을 구하는 일도 체력이 있어야 하니까!' },
  { id: 'bran', name: '브란', role: '대장장이 · 제작', kind: 'craft', sprite: 'smith', zone: 'town', x: 29*TILE, y: 20.5*TILE, dialog: '좋은 무기에는 좋은 재료와 약간의 고집이 필요하지. 재료를 가져오면 네 손에 맞춰 만들어 주겠어.' },
  { id: 'erin', name: '에린', role: '치유사', kind: 'heal', sprite: 'healer', zone: 'town', x: 24*TILE, y: 24.5*TILE, dialog: '잠깐 쉬어 가요. 돌아올 곳이 있다는 걸 잊지 않으면, 조금 멀리 가도 괜찮아요.' }
];
export const SHOP = ['potion','mana','leather','charm'];
export const objectiveLabel = (o) => o.kind === 'kill' ? (o.target === 'any' ? '몬스터 처치' : `${MONSTERS[o.target]?.name || o.target} 처치`) : `${ITEMS[o.target]?.name || o.target} 채집`;
export const getStats = (p, now=Date.now()) => {
  const c=CLASSES[p.classId] || CLASSES.guardian;
  const s={maxHp:c.hp+(p.level-1)*18,maxMp:c.mp+(p.level-1)*6,atk:c.atk+(p.level-1)*3,def:c.def+(p.level-1),crit:5,speed:c.speed,range:c.range};
  for(const id of Object.values(p.equipment||{})) {
    const i=ITEMS[id]; if(!i)continue;
    s.maxHp+=i.hp||0; s.maxMp+=i.mp||0; s.atk+=i.atk||0; s.def+=i.def||0; s.crit+=i.crit||0;
    const n=p.enhancements?.[id]||0;
    const bonus=enhancementBonus(i.slot,n);s.atk+=bonus.atk||0;s.def+=bonus.def||0;s.maxHp+=bonus.hp||0;s.maxMp+=bonus.mp||0;
  }
  if(c.tier==='novice'){s.atk*=.86;s.def*=.90;s.maxHp*=.94;}
  const passive=c.passive||{};
  s.atk+=passive.atk||0;s.def+=passive.def||0;s.maxHp+=passive.hp||0;s.crit+=passive.crit||0;s.speed+=passive.speed||0;
  if(p.title&&p.titles?.includes(p.title)){
    const b=titleStatBonus(p.title);s.atk+=b.atk||0;s.def+=b.def||0;s.maxHp+=b.hp||0;s.maxMp+=b.mp||0;s.crit+=b.crit||0;
  }
  const mastery=Math.min(10,Math.floor((p.discovery?.mastery?.[p.classId]||0)/25));
  s.atk+=Math.floor(mastery/3);s.maxHp+=mastery*2;
  const a=cleanAttributes(p.attributes,p.level),family=c.family||p.classId;
  s.atk+=a.str*(family==='guardian'?1.8:.55)+a.dex*(family==='ranger'?1.7:.5)+a.int*(family==='mage'?1.8:.45);
  s.maxHp+=a.vit*12;s.def+=a.vit*.4;s.maxMp+=a.int*4;
  s.speed+=a.dex*.3;s.crit+=a.dex*.08+a.luk*.22;s.manaRegen=3+(passive.manaRegen||0)+a.int*.03;
  s.weakened=(p.deathWeakUntil||0)>now;
  if(s.weakened){s.atk*=.9;s.speed*=.92;}
  s.crit=Math.min(s.crit,45);s.speed=Math.min(s.speed,225);
  for(const key of ['maxHp','maxMp','atk','def'])s[key]=Math.round(s[key]);
  return s;
};

installExpansion({CLASSES,ITEMS,MONSTERS,ZONES,NPCS,QUESTS,RECIPES,SHOP});

installBossGear({ITEMS,RECIPES,MONSTERS});
installExpeditions({ZONES,MONSTERS,ITEMS,RECIPES});
Object.assign(ZONES,CHALLENGE_ZONES);
installDungeons({ZONES,MONSTERS,ITEMS});
installRealms({ZONES,MONSTERS,ITEMS});
installEncounterIdentities({MONSTERS,ZONES,QUESTS});
installExtraItems({ITEMS,RECIPES});

// Combat pacing (applied once at startup to canonical monster definitions).
// A fresh adventurer should survive an error, but cannot one-shot whole packs.
// Endgame ecology, quest and world-boss identifiers stay unchanged.
for(const enemy of Object.values(MONSTERS)){
 if(enemy.boss){
  enemy.hp=Math.round(enemy.hp*1.38);
  enemy.atk=Math.round(enemy.atk*.98);
  enemy.def=Math.round(enemy.def*1.14+2);
 }else{
  enemy.hp=Math.round(enemy.hp*(enemy.level<=10?1.65:1.35));
  enemy.atk=Math.round(enemy.atk*(enemy.level<=10?1.20:1.12));
  enemy.def=Math.round(enemy.def*1.17+1);
 }
}


// Every region, including the original four, has a stable UI/save identifier.
for(const [id,zone]of Object.entries(ZONES))zone.id=id;
