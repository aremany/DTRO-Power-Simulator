/**
 * 전력 시스템 시뮬레이터
 * 
 * 요소 구조:
 * - p1~p5: 전력선 (path)
 * - s1~s2: 차단기 (rect)
 * - c1~c2: 단로기 (circle/ellipse)
 * 
 * 규칙:
 * - p1은 항상 ON (빨강)
 * - 스위치(c1, s1, s2, c2)는 자신의 상태만 표시 (투입=빨강, 개방=초록)
 * - 전력선(p2~p5)은 상위 모든 스위치가 투입되어야 급전
 * - 인터락 오조작 시 경보 메시지 및 블링킹 표시
 */

// ========================================
// 1. 전역 상태 관리
// ========================================

const switchStates = {
    // 전력선 (p1은 항상 ON)
    'p1': true,   // 항상 ON
    'p2': false,
    'p3': false,
    'p4': false,
    'p5': false,

    // 차단기
    's1': false,
    's2': false,

    // 단로기
    'c1': false,
    'c2': false
};

// 경보음 객체 (22계통 참고)
let alarmSound = null;

// ========================================
// 2. SVG 로드 및 초기화
// ========================================

// SVG 데이터 (직접 포함하여 독립 실행 가능하도록 함)
const svgData = `
<svg
   width="210mm"
   height="297mm"
   viewBox="0 0 210 297"
   version="1.1"
   id="svg1"
   xmlns="http://www.w3.org/2000/svg">
  <g id="layer1">
    <rect style="fill:none;stroke:#2656ff;stroke-width:2" id="s2" width="10.67" height="10.30" x="38.19" y="106.02" />
    <rect style="fill:none;stroke:#2656ff;stroke-width:2" id="s1" width="10.67" height="10.30" x="38.21" y="74.90" />
    <path style="fill:none;stroke:#2656ff;stroke-width:2" d="M 43.38,24.37 V 45.39" id="p1" />
    <path style="fill:none;stroke:#2656ff;stroke-width:2" d="M 43.41,53.71 V 74.74" id="p2" />
    <path style="fill:none;stroke:#2656ff;stroke-width:2" d="M 43.49,84.99 V 106.01" id="p3" />
    <path style="fill:none;stroke:#2656ff;stroke-width:2" d="m 43.53,116.39 v 21.02" id="p4" />
    <ellipse style="fill:none;stroke:#2656ff;stroke-width:2" id="c1" cx="43.40" cy="49.74" rx="4.02" ry="4.02" />
    <circle style="fill:none;stroke:#2656ff;stroke-width:2" id="c2" cx="43.77" cy="141.56" r="4.02" />
    <path style="fill:none;stroke:#2656ff;stroke-width:2" d="M 15.45,166.34 H 139.11" id="p5" />
  </g>
</svg>
`;

// DOM 로드 후 실행
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('svg-container').innerHTML = svgData;
    initializeSimulator();
});

// ========================================
// 3. 시뮬레이터 초기화
// ========================================

function initializeSimulator() {
    console.log('시뮬레이터 초기화 중...');

    // 경보음 초기화
    initializeAlarmSound();

    // 클릭 이벤트 리스너 추가
    const svgContainer = document.getElementById('svg-container');
    if (svgContainer) {
        svgContainer.addEventListener('click', handleSvgClick);
    }

    // 제어 버튼 생성
    createControlButtons();

    // 상태 패널 생성
    createStatusPanel();

    // 초기 색상 업데이트
    updateColors();

    console.log('시뮬레이터 초기화 완료');
}

// ========================================
// 4. 경보음 초기화 (22계통 참고)
// ========================================

function initializeAlarmSound() {
    alarmSound = {
        play: function () {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();

            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(800, audioContext.currentTime);

            gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);

            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);

            oscillator.start(audioContext.currentTime);
            oscillator.stop(audioContext.currentTime + 0.2);
        }
    };
}

// ========================================
// 5. 클릭 이벤트 처리
// ========================================

function handleSvgClick(event) {
    event.preventDefault();
    let target = event.target;

    // 부모 요소로 올라가며 ID 찾기 (22계통 방식)
    while (target && target.tagName !== 'svg' && !target.id) {
        target = target.parentNode;
    }

    if (!target || !target.id) return;

    const id = target.id;

    // 차단기(s) 또는 단로기(c)만 클릭 가능
    if (id.startsWith('s') || id.startsWith('c')) {
        toggleSwitch(id);
    }
}

// ========================================
// 6. 스위치 토글
// ========================================

function toggleSwitch(id) {
    // p1은 항상 ON이므로 변경 불가
    if (id === 'p1') {
        console.log('p1은 항상 ON 상태입니다.');
        return;
    }

    // 인터락 체크: c1은 s1이 ON 상태일 때 조작 불가
    if (id === 'c1' && switchStates['s1']) {
        console.log('⚠️ 인터락 오조작: c1은 s1이 투입(ON) 상태일 때 조작할 수 없습니다.');

        // 오조작 경보 표시 (블링킹)
        showAlarmMessage(
            '⚠️ 인터락 오조작 경보 ⚠️',
            'C1 단로기는 S1 차단기가 투입 상태일 때 조작할 수 없습니다.',
            '먼저 S1 차단기를 개방하세요.'
        );

        // 경보음 재생 (인터락 경고 - 3회)
        if (alarmSound) {
            alarmSound.play();
            setTimeout(() => alarmSound.play(), 200);
            setTimeout(() => alarmSound.play(), 400);
        }
        return;
    }

    const currentState = switchStates[id];
    const newState = !currentState;

    switchStates[id] = newState;
    console.log(`${id}: ${newState ? 'ON (투입)' : 'OFF (개방)'}`);

    // 경보음 재생 (22계통 참고)
    if (alarmSound) {
        alarmSound.play();
    }

    // 색상 업데이트
    updateColors();

    // 상태 패널 업데이트
    updateStatusPanel();
}

// ========================================
// 오조작 경보 메시지 표시 (블링킹)
// ========================================

function showAlarmMessage(title, text, instruction) {
    // 기존 경보 메시지 제거
    const existingAlarm = document.querySelector('.alarm-message');
    if (existingAlarm) {
        existingAlarm.remove();
    }

    // 경보 메시지 생성
    const alarmDiv = document.createElement('div');
    alarmDiv.className = 'alarm-message';

    const titleDiv = document.createElement('div');
    titleDiv.className = 'alarm-title';
    titleDiv.textContent = title;

    const textDiv = document.createElement('div');
    textDiv.className = 'alarm-text';
    textDiv.textContent = text;

    const instructionDiv = document.createElement('div');
    instructionDiv.className = 'alarm-instruction';
    instructionDiv.textContent = instruction;

    alarmDiv.appendChild(titleDiv);
    alarmDiv.appendChild(textDiv);
    alarmDiv.appendChild(instructionDiv);

    document.body.appendChild(alarmDiv);

    // 3초 후 자동 제거
    setTimeout(() => {
        if (alarmDiv.parentNode) {
            alarmDiv.remove();
        }
    }, 3000);
}

// ========================================
// 7. 색상 업데이트 (전력 흐름 계산)
// ========================================

function updateColors() {
    // 1. p1은 항상 ON (빨강)
    setElementColor('p1', true);

    // 2. 스위치들은 자신의 상태만 표시 (투입=빨강, 개방=초록)
    setElementColor('c1', switchStates['c1']);
    setElementColor('s1', switchStates['s1']);
    setElementColor('s2', switchStates['s2']);
    setElementColor('c2', switchStates['c2']);

    // 3. 전력선은 상위 모든 스위치가 투입되어야 급전
    // p2: c1이 투입되어야 급전
    const p2_powered = switchStates['c1'];
    setElementColor('p2', p2_powered);
    switchStates['p2'] = p2_powered;

    // p3: c1 AND s1이 투입되어야 급전
    const p3_powered = switchStates['c1'] && switchStates['s1'];
    setElementColor('p3', p3_powered);
    switchStates['p3'] = p3_powered;

    // p4: c1 AND s1 AND s2가 투입되어야 급전
    const p4_powered = switchStates['c1'] && switchStates['s1'] && switchStates['s2'];
    setElementColor('p4', p4_powered);
    switchStates['p4'] = p4_powered;

    // p5: c1 AND s1 AND s2 AND c2가 투입되어야 급전
    const p5_powered = switchStates['c1'] && switchStates['s1'] && switchStates['s2'] && switchStates['c2'];
    setElementColor('p5', p5_powered);
    switchStates['p5'] = p5_powered;
}

function setElementColor(id, isOn) {
    const element = document.getElementById(id);
    if (element) {
        if (isOn) {
            element.classList.remove('on-green');
            element.classList.add('on-red');
        } else {
            element.classList.remove('on-red');
            element.classList.add('on-green');
        }
    }
}

// ========================================
// 8. 제어 버튼 생성
// ========================================

function createControlButtons() {
    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'control-buttons';

    // 초기화 버튼
    const resetButton = document.createElement('button');
    resetButton.textContent = '초기화';
    resetButton.onclick = () => location.reload();

    // 전체 ON 버튼
    const allOnButton = document.createElement('button');
    allOnButton.textContent = '전체 투입';
    allOnButton.onclick = () => {
        ['c1', 's1', 's2', 'c2'].forEach(id => {
            switchStates[id] = true;
        });
        updateColors();
        updateStatusPanel();
        if (alarmSound) alarmSound.play();
    };

    // 전체 OFF 버튼
    const allOffButton = document.createElement('button');
    allOffButton.textContent = '전체 개방';
    allOffButton.onclick = () => {
        ['c1', 's1', 's2', 'c2'].forEach(id => {
            switchStates[id] = false;
        });
        updateColors();
        updateStatusPanel();
        if (alarmSound) alarmSound.play();
    };

    buttonContainer.appendChild(resetButton);
    buttonContainer.appendChild(allOnButton);
    buttonContainer.appendChild(allOffButton);
    document.body.appendChild(buttonContainer);
}

// ========================================
// 9. 상태 패널 생성
// ========================================

function createStatusPanel() {
    const panel = document.createElement('div');
    panel.className = 'status-panel';
    panel.id = 'status-panel';

    const title = document.createElement('h3');
    title.textContent = '시스템 상태';
    panel.appendChild(title);

    // 각 요소의 상태 표시
    const elements = [
        { id: 'p1', name: 'P1 (전원)', type: 'power' },
        { id: 'c1', name: 'C1 (단로기)', type: 'switch' },
        { id: 'p2', name: 'P2 (전력선)', type: 'line' },
        { id: 's1', name: 'S1 (차단기)', type: 'switch' },
        { id: 'p3', name: 'P3 (전력선)', type: 'line' },
        { id: 's2', name: 'S2 (차단기)', type: 'switch' },
        { id: 'p4', name: 'P4 (전력선)', type: 'line' },
        { id: 'c2', name: 'C2 (단로기)', type: 'switch' },
        { id: 'p5', name: 'P5 (전력선)', type: 'line' }
    ];

    elements.forEach(elem => {
        const item = document.createElement('div');
        item.className = 'status-item';
        item.id = `status-${elem.id}`;

        const nameSpan = document.createElement('span');
        nameSpan.textContent = elem.name;

        const stateSpan = document.createElement('span');
        stateSpan.id = `state-${elem.id}`;

        item.appendChild(nameSpan);
        item.appendChild(stateSpan);
        panel.appendChild(item);
    });

    document.body.appendChild(panel);
    updateStatusPanel();
}

function updateStatusPanel() {
    const elements = [
        { id: 'p1', type: 'power' },
        { id: 'c1', type: 'switch' },
        { id: 'p2', type: 'line' },
        { id: 's1', type: 'switch' },
        { id: 'p3', type: 'line' },
        { id: 's2', type: 'switch' },
        { id: 'p4', type: 'line' },
        { id: 'c2', type: 'switch' },
        { id: 'p5', type: 'line' }
    ];

    elements.forEach(elem => {
        const stateSpan = document.getElementById(`state-${elem.id}`);
        const statusItem = document.getElementById(`status-${elem.id}`);

        if (stateSpan && statusItem) {
            const isOn = switchStates[elem.id];

            // 스위치는 투입/개방, 전력선은 급전/단전
            if (elem.type === 'switch') {
                stateSpan.textContent = isOn ? '투입' : '개방';
            } else {
                stateSpan.textContent = isOn ? '급전' : '단전';
            }

            statusItem.classList.remove('on', 'off');
            statusItem.classList.add(isOn ? 'on' : 'off');
        }
    });
}
