/**
 * The Unwritten Atlas: sixteen authored provinces, each with nine connected sectors.
 * Terrain is deterministic; names, chapter themes and landmarks are authored data.
 * No map is generated until entered. Seeds are stable across server/client.
 */
import {ENDGAME_REGIONS,endgameCombatStats} from './expansion.js';
import {xpRequired} from './rpg.js';

const LATE_PROVINCES={
 sunscar:{keeper:'태양길 측량사 라안',tablet:'황혼 원정대의 석판',motto:'꺼진 봉화 사이에 다시 돌아올 길을 잇다',
  names:['붉은 천막 전초지','열기 어린 자갈벌','깨진 해시계 언덕','황동 수로 협곡','불볕 유리정원','빛을 잃은 봉화대','황혼 군단의 주둔지','태양핵 채석장','첫 여명의 제단'],
  fragments:['첫 원정대는 태양을 찾기 전에 뒤따를 이들을 위한 천막부터 세웠다.','자갈에 남은 수레 자국은 열기 속에서도 우물을 향해 이어진다.','해시계의 그림자가 멈춘 날에도 측량사는 다음 교대 시간을 기록했다.','물길을 막던 황동 문은 열을 나눠 받으면 다시 움직인다.','유리꽃은 가장 뜨거운 낮을 견디고 해가 기울 때 길을 비춘다.','봉화지기는 마지막 불씨를 태우지 않고 이웃 탑에 나누어 주었다.','군단의 깃발 아래에는 전투 명령보다 귀환자 명부가 오래 남았다.','광부들은 태양핵을 캐낸 자리마다 무너질 천장을 받칠 기둥을 세웠다.','첫 여명은 승전 소식과 함께 오지 않았다. 모두가 돌아왔다는 보고와 함께 왔다.']},
 deepsea:{keeper:'잠수 안내사 세린',tablet:'잠수부의 방수 일지',motto:'깊어지는 물속에서도 서로의 귀환선을 놓지 않다',
  names:['잠수종 정박지','푸른 기포 여울','검은 산호 능선','압력문 관측소','난파 함대의 묘지','진주를 품은 해구','침몰 왕궁 외벽','멈춘 조수 기관실','해저 왕좌의 숨결'],
  fragments:['잠수종의 종소리는 내려갈 때 한 번, 모두 돌아왔을 때 두 번 울렸다.','푸른 기포는 수면을 잊은 여행자에게도 위쪽을 가리킨다.','산호에 묶인 낡은 밧줄은 가장 깊이 간 사람의 것이 아니라 마지막까지 기다린 사람의 것이었다.','압력문의 관리자는 서두르는 이를 위해 문을 빨리 열지 않았다.','난파선의 이름을 읽어 주자 바다는 잠시 돛이 흔들리던 소리를 돌려주었다.','진주를 찾는 손은 해구의 바닥보다 먼저 동료의 숨을 살폈다.','왕궁 외벽에는 물이 들어온 높이와 피난민이 지나간 시간이 함께 새겨져 있다.','조수 기관실을 다시 움직인 것은 왕의 인장이 아니라 남은 잠수부들의 협력이었다.','깊은 왕좌에서 들린 마지막 명령은 올라가라는 한마디였다.']},
 wildroot:{keeper:'거목 수의사 나엘',tablet:'수액에 봉한 진료 기록',motto:'썩은 가지를 지나 아직 살아 있는 뿌리를 찾다',
  names:['수액 감시 야영지','젖은 잎의 산책로','포자 비늘 골짜기','잠식된 묘목원','부러진 가지 회랑','천년 이끼 수문','울음을 삼킨 수액호','일곱 심근의 매듭','거목의 마지막 맥박'],
  fragments:['야영지는 거목을 쓰러뜨릴 도끼 대신 병든 줄기를 감쌀 천을 먼저 준비했다.','잎맥을 따라 흐르는 물은 가장 작은 뿌리에도 같은 계절을 전한다.','독포자 사이를 건너는 길에는 먼저 지나간 이가 묶어 둔 흰 끈이 남아 있다.','묘목원은 자라지 않는 나무의 이름표도 버리지 않았다.','부러진 가지가 다리가 되자 숲의 양쪽에서 떨어져 살던 사람들이 만났다.','수문을 열기 전에 나엘은 아래쪽 야영지에 물이 간다는 소식을 전했다.','수액호의 울음은 거목의 분노가 아니라 말라 가는 뿌리의 신호였다.','일곱 심근을 풀 때는 가장 굵은 것보다 가장 약한 매듭부터 살펴야 했다.','마지막 맥박은 혼자 살아남겠다는 뜻이 아니었다. 숲 전체에 물을 보내는 박동이었다.']},
 clockwork:{keeper:'교대 시계공 오르딘',tablet:'멈춘 교대조의 장부',motto:'같은 정오에 갇힌 성채에 다음 시간을 돌려주다',
  names:['정지된 교대소','초침 조립 거리','서리 톱니 계곡','역행 계단 광장','추 없는 시계탑','유리태엽 정원','정오 근위대 회랑','시간추 봉인실','두 번째 새벽의 종루'],
  fragments:['교대소의 명부에는 같은 날짜 아래 서로 다른 사람의 필체가 쌓였다.','초침을 만드는 장인은 한 칸의 간격이 누군가의 휴식이라는 것을 잊지 않았다.','얼어붙은 톱니 사이에는 돌아갈 집의 열쇠가 녹슬지 않은 채 남아 있다.','역행 계단에서 앞서가려던 사람은 뒤에 있는 동료의 손을 잡고서 출구를 찾았다.','탑의 추를 잃은 날에도 파수병은 식사 종을 직접 울렸다.','유리태엽은 강하게 감을수록 오래가는 장치가 아니었다.','근위대는 정오가 끝나지 않아도 부상자에게 차례로 자리를 내주었다.','시간추를 봉한 이유는 미래가 두려워서가 아니라 다시 떠날 준비가 부족했기 때문이었다.','두 번째 새벽의 종소리는 완벽한 과거 대신 아직 고칠 수 있는 내일을 알렸다.']},
 stormcrown:{keeper:'전선 항해사 로윈',tablet:'번개에 그을린 항로도',motto:'무너지는 하늘 다리마다 돌아올 표식을 남기다',
  names:['묶인 구름 정박소','뇌운 방목지','바람칼 절벽','금 간 천둥다리','낙뢰 기둥 숲','폭풍 기수의 광장','왕관 파편 부유지','최후의 피뢰 성벽','천둥왕의 외곽 옥좌'],
  fragments:['정박소의 밧줄은 배를 붙잡는 동시에 바람의 세기를 전해 주었다.','뇌운 사이를 걷던 목자는 번개가 쉬는 순간을 아이들에게 가르쳤다.','절벽의 표식은 가장 빠른 비행선을 위한 것이 아니라 가장 느린 수송선을 위한 것이었다.','금 간 다리를 건넌 뒤 원정대는 반대편에도 같은 경고 깃발을 세웠다.','낙뢰 기둥은 하늘의 힘을 빼앗지 않고 땅으로 흘려보냈다.','기수들은 폭풍이 잠잠해질 때까지 서로의 말에 씌울 천을 나눴다.','왕관의 파편에는 왕의 이름보다 무너진 다리의 위치가 더 많이 적혔다.','피뢰 성벽의 문지기는 마지막 배가 올 때까지 높은 깃발을 내리지 않았다.','옥좌에 오른 자가 처음 내려다본 것은 정복할 땅이 아니라 아직 연결하지 못한 항로였다.']},
 voidfront:{keeper:'경계 순찰자 아샤',tablet:'이름을 붙잡는 봉인판',motto:'이름이 지워지는 땅에 서로를 기억할 길을 새기다',
  names:['귀환 이름표 초소','빛 없는 국경로','검은 별 파편지','빈 목소리 회랑','뒤집힌 검문소','망각 군단 훈련장','사라진 지도 보관소','경계심장 균열대','문을 삼킨 자의 앞뜰'],
  fragments:['초소에서는 이름을 묻기 전에 돌아갈 장소를 함께 적어 주었다.','빛 없는 길의 표지판은 보이지 않아도 손끝으로 읽을 수 있도록 깊게 새겨졌다.','별의 파편을 모으던 이는 자신의 얼굴보다 함께 온 사람의 목소리를 먼저 기억했다.','빈 목소리가 대답할 때 순찰대는 혼자 이름을 부르지 않았다.','안과 밖이 바뀐 검문소에서 통행증 대신 서로의 손목을 묶는 끈이 쓰였다.','망각 군단의 훈련장에는 이기는 법보다 흩어진 동료를 찾는 법이 오래 남았다.','지워진 지도는 버려지지 않았다. 살아 돌아온 이가 새 길을 그릴 자리가 되었다.','경계의 심장이 갈라질 때 아샤는 후퇴 명령과 함께 모두의 이름을 다시 불렀다.','문을 삼킨 자의 앞뜰에 남긴 표식은 영웅의 이름이 아니라 귀환 방향이었다.']},
 astralforge:{keeper:'별벼림 조장 헤온',tablet:'성좌 대장간 작업일지',motto:'부서진 별을 이어 누구도 길을 잃지 않을 하늘을 만들다',
  names:['불씨 배급 전초소','별가루 운반로','부서진 성좌 야적장','적색 혜성 냉각지','잿빛 모루의 회랑','꺼지지 않는 환기탑','용광로 수문 광장','별벼림 핵심 공방','대장장이의 마지막 불꽃'],
  fragments:['전초소는 용광로의 불씨를 먼저 야영지 난로에 나누었다.','운반로의 수레에는 별가루의 무게와 운반자의 교대 시간이 함께 적혀 있었다.','부서진 성좌의 조각은 제자리를 찾기 전에도 서로 다른 길을 비출 수 있었다.','혜성을 식히는 물은 서두르지 않고 작은 수문부터 흘러갔다.','모루에 남은 망치 자국은 한 사람의 솜씨가 아니라 이어 일한 여러 사람의 기록이었다.','환기탑을 지킨 이는 완성될 별보다 지금 숨 쉬는 장인들을 먼저 생각했다.','수문을 여는 손과 닫는 손은 서로 눈을 맞춘 뒤에야 움직였다.','핵심 공방의 설계도에는 가장 빛나는 별 옆에 쉬어 갈 작은 그늘도 그려져 있었다.','마지막 불꽃은 새로운 무기를 만들기보다 돌아오는 이들의 길을 밝히는 데 쓰였다.']},
 dawnend:{keeper:'새벽 기록관 유안',tablet:'다음 여행자를 위한 서문',motto:'끝에 도착한 이들이 다음 여행자의 출발을 준비하다',
  names:['마지막 관측 야영지','여명 안개 초원','돌아온 별의 정원','금빛 조수 전망대','영원의 수호 회랑','처음 이름의 도서관','흩어진 약속의 원환','마지막 성좌 관측선','모두가 돌아온 새벽'],
  fragments:['마지막 야영지는 도착한 이들에게 훈장 대신 따뜻한 물과 빈 의자를 내주었다.','안개가 걷힐 때 보이는 첫 길은 누구 혼자 만든 길도 아니었다.','돌아온 별의 정원에서는 빛의 크기보다 돌아온 순서를 기억했다.','전망대의 조수표에는 멀리 떠나는 시간과 다시 만날 시간이 나란히 적혀 있었다.','영원의 수호자들은 문을 닫는 임무가 끝나자 길을 안내하는 일을 배웠다.','도서관의 첫 책은 왕의 전기가 아니라 처음 출발한 여행자의 작은 수첩이었다.','흩어진 약속은 모두 같은 모양으로 이어지지 않았다. 서로 다른 빈칸을 남겨 둔 채 원을 이뤘다.','관측선 끝에 선 유안은 마지막 별을 표시한 뒤 다음 사람이 적을 여백을 비워 두었다.','모두가 돌아온 새벽에도 길은 끝나지 않았다. 누군가 처음 신발 끈을 묶고 있었기 때문이다.']}
};
export const PROVINCES = [
 {id:'meadow',name:'바람목 대평원',motto:'길을 잃은 사람들의 깃발을 다시 세우다',
  keeper:'연락병 루아',level:2,seed:31001,theme:'meadow',weather:'leaves',
  names:['개척자의 쉼터','세 갈래 풀바다','쓰러진 깃발 언덕','사슴뿔 협곡','순례자의 긴 다리','별잎 목장','바람을 듣는 절벽','백 개의 풍차터','첫 서약의 고원'],
  fragments:['아무도 돌아오지 않는 길에 루아는 매일 새 깃발을 꽂았다.','전령들은 가장 빠른 길 대신 가장 안전한 길을 표시했다.','찢어진 깃발에는 돌아올 사람들의 이름이 남아 있다.','가시뿔은 길을 막는 괴물이 아니라 묘지를 지키는 파수꾼이었다.','다리의 돌마다 이름 없이 건너간 이들의 발자국이 새겨졌다.','목장은 버려졌지만 병든 여행자를 위한 약초밭은 살아 있다.','바람을 멈추게 할 수는 없다. 대신 누군가의 목소리를 실어 보낼 수 있다.','풍차가 모두 멈춘 날에도 마지막 가루로 빵을 구웠다.','처음의 서약은 이기는 것이 아니라 끝까지 돌아오는 것이었다.']},
 {id:'coast',name:'일곱 조수 군도',motto:'바다에 잠긴 편지를 육지로 돌려보내다',
  keeper:'등대지기 노엘',level:6,seed:42002,theme:'coast',weather:'stars',
  names:['유리항 정박지','조개종 갯벌','푸른 편지 해변','소금안개 선착장','부서진 등대섬','해류의 긴 회랑','산호묘지','잠긴 도서관','돌아오는 파도끝'],
  fragments:['등대지기는 돌아오지 않은 배의 방을 매일 비워 두었다.','조개종은 바람이 아니라 누군가의 이름을 들으면 울린다.','편지의 먹은 번졌지만 마지막 문장, 기다린다는 말은 남았다.','사람을 싣지 못한 배는 약과 식량이라도 실어 날랐다.','등대의 불이 꺼진 것은 불씨가 부족해서가 아니었다.','예언자는 바다를 명령하지 않는다. 물결이 말할 때 듣는다.','산호 아래에서는 적과 아군의 닻이 같은 방향을 향한다.','물에 젖은 책은 역사를 지우지 못했다. 다만 천천히 읽게 했다.','마지막 물결이 돌려준 것은 보물이 아닌 집으로 가는 길이었다.']},
 {id:'desert',name:'유실된 태양왕로',motto:'왕의 이름보다 먼저 지워진 백성의 이름을 찾다',
  keeper:'기록상 바실',level:9,seed:53003,theme:'desert',weather:'sand',
  names:['오아시스 교역소','유리모래 사구','맹세 없는 국경','붉은 수로','빈 왕좌 정원','꺼진 태양 신전','대장장이의 분지','재를 품은 골짜기','새 이름의 능묘'],
  fragments:['오아시스의 물은 왕에게도 여행자에게도 같은 값이었다.','모래는 성을 삼켰지만 길손들이 남긴 약속은 삼키지 못했다.','국경의 표지석에는 통행세보다 먼저 피난민의 이름이 적혔다.','불을 다루던 이는 마지막까지 물을 나르는 일을 그만두지 않았다.','왕좌가 비어 있던 날 백성들은 처음으로 서로의 얼굴을 보았다.','불씨를 지키는 일과 세상을 태우는 일은 같은 힘에서 시작된다.','대장장이는 칼을 녹여 문을 고칠 경첩을 만들었다.','재 속에 남은 깃털은 죽지 않았다는 증거가 아니라 다시 날겠다는 약속이다.','왕은 자신의 이름을 지우고 돌아오지 못한 사람들의 이름을 새겼다.']},
 {id:'swamp',name:'뿌리기억 대습원',motto:'살아 있는 뿌리와 죽은 별 사이에서 답을 듣다',
  keeper:'뿌리학자 미온',level:10,seed:64004,theme:'swamp',weather:'fog',
  names:['이끼 조사기지','등불 없는 진흙길','꿈포자 숲','잠긴 치유원','속삭이는 수목원','오래된 약탕골','영혼의 물길','일곱 뿌리 회랑','기억나무 심부'],
  fragments:['미온은 병든 나무를 베기 전에 살아 있는 뿌리를 찾았다.','길은 눈에 보이지 않아도 작은 등불들을 따라 이어진다.','꿈을 지키는 포자와 잠을 빼앗는 독은 같은 줄기에서 자랐다.','치유사는 약이 떨어진 뒤에도 환자의 이름을 불러 주었다.','나무는 질문에 답하지 않았다. 대신 계절을 한 번 더 견뎠다.','약탕에 마지막으로 넣는 것은 강한 약초가 아니라 적당한 물이었다.','죽은 자를 부른다는 것은 다시 붙잡는 것일까, 놓아주는 것일까.','일곱 뿌리는 서로 다른 곳에서 시작해 같은 물을 나눴다.','기억은 주인을 가두는 덩굴이 아니라 다음 계절을 위한 씨앗이었다.']},
 {id:'frost',name:'백야의 먼 변경',motto:'얼어붙은 시간 속에서 아직 살아 있는 약속을 구하다',
  keeper:'설원 전령 이오',level:13,seed:75005,theme:'frost',weather:'snow',
  names:['눈바람 대피소','부서진 초침 평원','유리늑대 능선','흰 장막 계곡','얼음우편 정류장','거꾸로 흐르는 빙하','불씨 피난굴','동면자의 성벽','영원한 정오의 탑'],
  fragments:['눈보라가 오면 이오는 가장 늦은 사람의 발걸음에 속도를 맞췄다.','시계는 멈췄지만 기다리는 사람에게는 하루가 계속 흘렀다.','늑대가 울지 않는 밤에는 오히려 발자국을 더 조심해야 한다.','서리술사는 추위를 이긴 것이 아니라 온기를 어디에 남길지 배웠다.','배달되지 못한 편지는 눈 속에서도 수신인을 잊지 않았다.','시간을 되돌릴 수 있다 해도 타인의 선택까지 지워서는 안 된다.','불씨는 가장 큰 불이 아니라 끝까지 꺼지지 않는 불을 골랐다.','성벽의 보초는 돌아올 동료를 위해 마지막 문을 잠그지 않았다.','시간의 주인은 과거를 바꾸는 자가 아니라 다음 순간을 책임지는 자다.']},
 {id:'sky',name:'천공 유랑환도',motto:'갈라진 하늘의 다리를 다시 연결하다',
  keeper:'항로기사 세온',level:16,seed:86006,theme:'sky',weather:'stars',
  names:['구름항 전망대','번개풀 들판','바람을 묶는 탑','공명석 부유지','천둥 가교','흩어진 시계섬','매의 귀환 절벽','종 없는 종탑','하늘이 열린 자리'],
  fragments:['세온은 떨어진 다리를 지도에서 지우지 않고 다시 그렸다.','번개는 가장 강한 것을 찾는 것이 아니라 갈 곳을 찾는다.','바람을 붙잡으려던 탑은 바람이 지나갈 문을 만들고서 살아남았다.','같은 음도 어느 돌을 거치느냐에 따라 다른 기억을 울린다.','가교를 건널 때 사람들은 앞사람의 등을 믿고 한 걸음씩 옮겼다.','떨어진 시곗바늘은 모두 다른 시간을 가리키지만 같은 하늘을 본다.','매를 부르는 손은 묶어 두는 손이 아니라 다시 돌아올 자리다.','종이 사라졌어도 누군가는 남은 줄을 잡고 새벽을 알렸다.','하늘이 열린 자리는 지름길이 아니라 돌아갈 길도 생각하라는 경고였다.']},
 {id:'abyss',name:'경계 너머 심연',motto:'사라진 이름을 따라 공허에 길을 남기다',
  keeper:'경계 기록자 아인',level:21,seed:97007,theme:'abyss',weather:'fog',
  names:['침묵의 피난처','그림자 여울','꺼진 성좌 벌판','망각의 복도','뒤집힌 성문','왕 없는 연병장','돌아오지 않는 다리','검은 조수 해구','이름의 마지막 끝'],
  fragments:['아인은 기억할 수 없는 사람을 위해서도 빈 의자를 놓았다.','그림자는 주인을 따라 걷지만 주인보다 먼저 위험에 닿기도 한다.','별이 꺼진 곳에는 어둠이 아니라 아직 이름 붙이지 못한 길이 있었다.','망각은 슬픔을 없애 주지 않았다. 다만 누구를 그리워하는지 잊게 했다.','성문의 안과 밖이 바뀐 날 사람들은 문 대신 서로를 지켰다.','왕이 사라진 뒤에도 명령 없이 부상자를 옮기는 병사들이 있었다.','공허를 건너는 자는 돌아올 자리에 먼저 표식을 남겼다.','바다의 마지막 문장은 깊이가 아니라 돌아오는 물결에 쓰여 있다.','이름을 버린 자가 마지막으로 기억한 것은 자신이 아닌 동료의 이름이었다.']},
 {id:'observatory',name:'별무리 외곽성역',motto:'흩어진 기록을 모아 다음 새벽의 지도를 만들다',
  keeper:'관측사서 유라',level:25,seed:108008,theme:'observatory',weather:'stars',
  names:['성좌 관측전초','빈 망원경 정원','별실 방직회랑','달 그림자 원형극장','멈춘 천구의','새벽 문서고','왕관 없는 의전실','마지막 관측선','이름 없는 새벽'],
  fragments:['유라는 잃어버린 별보다 아직 서로를 보는 사람들을 먼저 적었다.','망원경이 비추는 것은 언제나 조금 전의 별이다. 지금은 스스로 보아야 한다.','별을 잇는 실은 끊어지지 않는 실이 아니라 다시 매듭지을 수 있는 실이었다.','무희가 춤을 멈춘 곳에서 집행자는 검을 내려놓는 법을 배웠다.','멈춘 천구의 안에서도 작은 추가 스스로의 무게로 흔들렸다.','새벽의 기록에는 영웅의 이름보다 빵과 붕대의 수량이 많았다.','왕관의 무게는 금의 무게가 아니라 책임져야 할 이름의 무게였다.','관측선 너머에는 지도 대신 앞으로 써야 할 여백이 펼쳐진다.','새벽은 누군가 혼자 얻는 칭호가 아니다. 함께 돌아온 이들이 부르는 시간이다.']},
 ...ENDGAME_REGIONS.map((z,i)=>({...LATE_PROVINCES[z.id],id:z.id,name:z.name,level:z.level,maxLevel:z.maxLevel,
  endgame:true,seed:130009+i*11001,theme:z.theme,weather:z.weather,color:z.color,material:z.material,gearTier:z.gearTier}))
];
const sectorLevel=(p,i)=>p.endgame?Math.floor(p.level+(p.maxLevel-p.level)*i/8):
 Math.min(30,p.level+(i===8?3:i>=5?2:i>=2?1:0));
export const EXPEDITION_ZONES=PROVINCES.flatMap(p=>p.names.map((name,i)=>({
 id:`${p.id}_reach_${i}`,name,subtitle:`${p.name} · ${p.motto}`,province:p.id,sector:i,
 minLevel:sectorLevel(p,i),...(p.endgame?{maxLevel:Math.min(p.maxLevel,sectorLevel(p,i)+2),endgame:true,
  material:p.material,gearTier:p.gearTier}:{}),
 width:128+(i%3===2?32:0),height:96+(i%3===1?16:0),
 theme:p.theme,weather:p.weather,seed:p.seed+i*137,spawn:[18,(96+(i%3===1?16:0))-18],
 music:p.id==='meadow'?'forest':'ruins',expedition:true,mobCount:56,
 color:p.color||{meadow:'#b3cd7c',coast:'#7ed4dc',desert:'#e0bd78',swamp:'#adb37b',frost:'#b4dce8',sky:'#ada6eb',abyss:'#bc8ed5',observatory:'#ecd4a2'}[p.id]
})));
export const expeditionId=(province,index)=>`${province}_reach_${index}`;
export const pointId=(province,index,kind='tablet')=>`${expeditionId(province,index)}_${kind}`;
export const LANDMARKS=EXPEDITION_ZONES.flatMap(z=>{
 const p=PROVINCES.find(p=>p.id===z.province),i=z.sector;
 return [
  {id:z.id+'_camp',kind:'camp',zone:z.id,name:p.keeper+'의 야영지',x:18*32+16,y:(z.height-18)*32+16,
   text:`${p.keeper}: “${p.motto}. 우선 귀환석에 손을 얹어. 여기는 돌아올 수 있는 자리니까.”`,sprite:'campfire'},
  {id:z.id+'_tablet',kind:'tablet',zone:z.id,name:p.tablet||['개척자의 돌판','물결의 편지','태양왕의 명부','뿌리의 기록','얼어붙은 일지','바람의 악보','사라진 이름','성좌의 서문'][PROVINCES.indexOf(p)],
   x:Math.floor(z.width*.27)*32+16,y:Math.floor(z.height*.24)*32+16,text:p.fragments[i],sprite:'relic_stone'},
  {id:z.id+'_watch',kind:'watch',zone:z.id,name:z.name+' 관측 표식',x:Math.floor(z.width*.77)*32+16,y:Math.floor(z.height*.27)*32+16,
   text:`남겨진 순찰 기록: ${p.fragments[(i+3)%9]} 다음 순찰대에게 이 길의 상태를 전해 달라는 부탁이 적혀 있다.`,sprite:'rune'},
  {id:z.id+'_trial',kind:'trial',zone:z.id,name:z.name+' 기억의 제단',x:Math.floor(z.width*.76)*32+16,y:Math.floor(z.height*.74)*32+16,
   text:`세 번의 기억이 깨어나면 이 땅의 파수꾼이 응답한다. 동료와 함께 도전할 수 있으며, 실패해도 다시 시작할 수 있다.`,sprite:'altar'}
 ];
});
export function installExpeditions({ZONES,MONSTERS,ITEMS,RECIPES}){
 ITEMS.wayfarer_seal={name:'길손의 증표',type:'material',icon:'charm',rarity:'rare',sell:15,desc:'야영지 의뢰와 기억의 시련에서 얻습니다. 대륙 장비 제작에 사용합니다.'};
 for(const z of EXPEDITION_ZONES){
  const base=ZONES[z.province];
  if(!z.endgame){ZONES[z.id]={...z,mobTypes:base.mobTypes,boss:base.boss};continue;}
  const mobTypes=base.mobTypes.map((type,i)=>{
   const id=z.id+'_mob_'+i,level=Math.min(z.maxLevel,z.minLevel+i);
   MONSTERS[id]={...MONSTERS[type],...endgameCombatStats(level,i),name:`${z.name}의 ${MONSTERS[type].name}`};
   return id;
  });
  const boss=z.id+'_warden';
  MONSTERS[boss]={...MONSTERS[base.boss],...endgameCombatStats(z.maxLevel,0,true),name:z.name+'의 기억 파수꾼'};
  ZONES[z.id]={...z,mobTypes,boss};
 }
 // Three new regional utility recipes; use existing equipment art rather than claiming new artwork.
 ITEMS.atlas_coat={name:'아득한 길의 외투',type:'gear',slot:'armor',icon:'armor',rarity:'epic',def:24,hp:180,mp:40,level:18,sell:900};
 ITEMS.pilgrim_charm={name:'수천 걸음의 매듭',type:'gear',slot:'charm',icon:'charm',rarity:'epic',hp:110,atk:18,mp:40,level:18,sell:800};
 ITEMS.memory_crown={name:'돌아온 자의 성물',type:'gear',slot:'charm',icon:'charm',rarity:'legendary',hp:160,atk:24,mp:65,level:27,sell:1400};
 RECIPES.push(
  {id:'atlas_coat',name:'아득한 길의 외투',output:'atlas_coat',count:1,gold:1100,cost:{wayfarer_seal:12,pelt:20,ore:15},level:18},
  {id:'pilgrim_charm',name:'수천 걸음의 매듭',output:'pilgrim_charm',count:1,gold:1000,cost:{wayfarer_seal:15,relic_dust:10,wood:15},level:18},
  {id:'memory_crown',name:'돌아온 자의 성물',output:'memory_crown',count:1,gold:2200,cost:{wayfarer_seal:35,astral:15,world_token:5},level:27}
 );
}
// All rewards are authoritative on the server; the atlas displays these same rules.
// Low-level reward amounts stay unchanged, and discoveries/surveys remain one-off.
export function expeditionRewards(z,kind){
 const n=z.minLevel??z.level,late=!!z.endgame;
 if(kind==='camp')return {xp:late?Math.round(xpRequired(n)*.02):50+n*8};
 if(kind==='page')return {xp:late?Math.round(xpRequired(n)*.01):45+n*5,seals:1};
 if(kind==='contract')return {gold:late?n*24:80+n*12,xp:late?Math.round(xpRequired(n)*.08):120+n*18,
  seals:2,material:late?z.material:null,materials:late?2:0};
 if(kind==='trial')return {gold:late?n*36:100+n*15,xp:late?Math.round(xpRequired(n)*.18):160+n*25,
  seals:3,material:late?z.material:null,materials:late?4:0};
 if(kind==='survey')return {gold:late?n*100:1200,xp:late?Math.round(xpRequired(z.maxLevel)*.35):1800,
  seals:12,material:late?z.material:null,materials:late?8:0};
 return {xp:0};
}
export function atlasTotals(ZONES){
 const publicZones=Object.values(ZONES).filter(z=>!z.challenge&&!z.dungeon&&!z.secretRealm);
 // Keep "old" anchored to the original twelve regions when later roads arrive.
 const old=publicZones.filter(z=>!z.expedition&&!z.endgame).reduce((n,z)=>n+z.width*z.height,0);
 const tiles=publicZones.reduce((n,z)=>n+z.width*z.height,0);
 return {regions:publicZones.length,expeditions:EXPEDITION_ZONES.length,landmarks:LANDMARKS.length,
   pages:LANDMARKS.filter(p=>p.kind==='tablet'||p.kind==='watch').length,provinces:PROVINCES.length,
   tiles,oldTiles:old,areaRatio:tiles/old};
}
