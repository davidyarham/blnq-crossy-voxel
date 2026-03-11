const gameRoot = document.getElementById('gameCanvas');
const scoreValue = document.getElementById('scoreValue');
const bestValue = document.getElementById('bestValue');
const stateValue = document.getElementById('stateValue');
const startOverlay = document.getElementById('startOverlay');
const gameOverOverlay = document.getElementById('gameOverOverlay');
const gameOverText = document.getElementById('gameOverText');
const startButton = document.getElementById('startButton');
const restartButton = document.getElementById('restartButton');
const howButton = document.getElementById('howButton');
const muteButton = document.getElementById('muteButton');
const touchButtons = [...document.querySelectorAll('[data-move]')];

const laneWidth = 2;
const laneDepth = 2;
const worldHalfWidth = 5;
const visibleBack = 4;
const visibleAhead = 16;
const laneCount = visibleBack + visibleAhead + 14;

let score = 0;
let best = Number(localStorage.getItem('crossy-voxel-best') || 0);
let gameState = 'ready';
let muted = false;
let moveQueue = [];
let lanes = [];
let animationId = null;

bestValue.textContent = String(best);

class AudioEngine {
	constructor() {
		this.ctx = null;
		this.master = null;
		this.enabled = true;
	}

	init() {
		if (this.ctx) return;
		const AudioContext = window.AudioContext || window.webkitAudioContext;
		if (!AudioContext) {
			this.enabled = false;
			return;
		}
		this.ctx = new AudioContext();
		this.master = this.ctx.createGain();
		this.master.gain.value = 0.18;
		this.master.connect(this.ctx.destination);
	}

	resume() {
		this.init();
		if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
	}

	setMuted(value) {
		this.enabled = !value;
		if (this.master) this.master.gain.value = value ? 0 : 0.18;
	}

	beep({
		frequency = 440,
		duration = 0.12,
		type = 'square',
		volume = 0.15,
		slide = 0,
		when = 0
	}) {
		if (!this.ctx || !this.enabled) return;
		const now = this.ctx.currentTime + when;
		const osc = this.ctx.createOscillator();
		const gain = this.ctx.createGain();
		osc.type = type;
		osc.frequency.setValueAtTime(frequency, now);
		if (slide) osc.frequency.linearRampToValueAtTime(frequency + slide, now + duration);
		gain.gain.setValueAtTime(0.0001, now);
		gain.gain.exponentialRampToValueAtTime(volume, now + 0.01);
		gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
		osc.connect(gain);
		gain.connect(this.master);
		osc.start(now);
		osc.stop(now + duration + 0.03);
	}

	hop() {
		this.beep({
			frequency: 420,
			slide: 120,
			duration: 0.08,
			type: 'square',
			volume: 0.12
		});
	}

	score() {
		this.beep({
			frequency: 540,
			duration: 0.08,
			type: 'triangle',
			volume: 0.1,
			when: 0
		});
		this.beep({
			frequency: 760,
			duration: 0.12,
			type: 'triangle',
			volume: 0.1,
			when: 0.06
		});
	}

	hit() {
		this.beep({
			frequency: 180,
			slide: -90,
			duration: 0.28,
			type: 'sawtooth',
			volume: 0.14
		});
	}

	splash() {
		this.beep({
			frequency: 260,
			slide: -160,
			duration: 0.18,
			type: 'triangle',
			volume: 0.13
		});
		this.beep({
			frequency: 180,
			slide: -100,
			duration: 0.24,
			type: 'square',
			volume: 0.1,
			when: 0.03
		});
	}
}

const audio = new AudioEngine();

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x15120f, 16, 42);

const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 100);
camera.position.set(0, 12.8, 15.8);
camera.lookAt(0, 0, 6.5);

const renderer = new THREE.WebGLRenderer({
	antialias: true,
	alpha: true
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
gameRoot.appendChild(renderer.domElement);

const ambientLight = new THREE.HemisphereLight(0xfff4dc, 0x4b3424, 1.45);
scene.add(ambientLight);

const sunLight = new THREE.DirectionalLight(0xffd39a, 1.75);
sunLight.position.set(12, 20, 10);
sunLight.castShadow = true;
sunLight.shadow.mapSize.width = 1024;
sunLight.shadow.mapSize.height = 1024;
sunLight.shadow.camera.left = -18;
sunLight.shadow.camera.right = 18;
sunLight.shadow.camera.top = 18;
sunLight.shadow.camera.bottom = -18;
scene.add(sunLight);

const fillLight = new THREE.DirectionalLight(0xb8d4ff, 0.35);
fillLight.position.set(-10, 8, 12);
scene.add(fillLight);

const rimLight = new THREE.DirectionalLight(0xffb36b, 0.28);
rimLight.position.set(4, 6, -10);
scene.add(rimLight);

const world = new THREE.Group();
scene.add(world);

const materials = {
	grass: new THREE.MeshToonMaterial({
		color: 0x6f9f45
	}),
	grassAlt: new THREE.MeshToonMaterial({
		color: 0x83b65a
	}),
	grassEdge: new THREE.MeshToonMaterial({
		color: 0x4f7332
	}),
	road: new THREE.MeshToonMaterial({
		color: 0x2f2a2c
	}),
	shoulder: new THREE.MeshLambertMaterial({
		color: 0x4a4447
	}),
	water: new THREE.MeshToonMaterial({
		color: 0x2b7c78
	}),
	waterEdge: new THREE.MeshLambertMaterial({
		color: 0x245d58
	}),
	laneStripe: new THREE.MeshLambertMaterial({
		color: 0xf3d18f
	}),
	curb: new THREE.MeshLambertMaterial({
		color: 0xb8aea3
	}),
	log: new THREE.MeshLambertMaterial({
		color: 0x8b5a34
	}),
	logRing: new THREE.MeshLambertMaterial({
		color: 0xb27a4f
	}),
	turtle: new THREE.MeshLambertMaterial({
		color: 0x5f9a62
	}),
	turtleShell: new THREE.MeshLambertMaterial({
		color: 0x314a31
	}),
	carA: new THREE.MeshToonMaterial({
		color: 0xf06a2b
	}),
	carB: new THREE.MeshToonMaterial({
		color: 0xf6c453
	}),
	carC: new THREE.MeshLambertMaterial({
		color: 0xcf4d1f
	}),
	truck: new THREE.MeshToonMaterial({
		color: 0xcab59c
	}),
	window: new THREE.MeshToonMaterial({
		color: 0xd7e7f3
	}),
	bumper: new THREE.MeshLambertMaterial({
		color: 0x221c1d
	}),
	wheel: new THREE.MeshLambertMaterial({
		color: 0x181414
	}),
	player: new THREE.MeshToonMaterial({
		color: 0xf5eedf
	}),
	playerWing: new THREE.MeshToonMaterial({
		color: 0xf4d26a
	}),
	playerBeak: new THREE.MeshToonMaterial({
		color: 0xee8d31
	}),
	playerDark: new THREE.MeshLambertMaterial({
		color: 0x433329
	}),
	eye: new THREE.MeshLambertMaterial({
		color: 0x211714
	})
};

function makeBox(w, h, d, material) {
	const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
	mesh.castShadow = true;
	mesh.receiveShadow = true;
	return mesh;
}

function addGrassTuft(parent, x, z) {
	const tuft = makeBox(0.24, 0.08, 0.24, Math.random() > 0.5 ? materials.grassAlt : materials.grass);
	tuft.position.set(x, 0.02, z);
	tuft.castShadow = false;
	parent.add(tuft);
}

function createPlayer() {
	const group = new THREE.Group();

	const feet = makeBox(0.46, 0.1, 0.34, materials.playerBeak);
	feet.position.set(0, 0.05, 0.1);

	const body = makeBox(0.9, 0.62, 0.96, materials.player);
	body.position.y = 0.46;

	const chest = makeBox(0.56, 0.26, 0.48, materials.playerWing);
	chest.position.set(0, 0.45, 0.34);

	const wingLeft = makeBox(0.18, 0.34, 0.56, materials.playerWing);
	const wingRight = wingLeft.clone();
	wingLeft.position.set(-0.5, 0.48, 0.04);
	wingRight.position.set(0.5, 0.48, 0.04);

	const tail = makeBox(0.34, 0.22, 0.24, materials.player);
	tail.position.set(0, 0.45, -0.54);

	const head = makeBox(0.66, 0.58, 0.66, materials.player);
	head.position.set(0, 0.95, 0.06);

	const beak = makeBox(0.34, 0.14, 0.32, materials.playerBeak);
	beak.position.set(0, 0.88, 0.48);

	const comb = makeBox(0.16, 0.12, 0.16, materials.playerWing);
	comb.position.set(0, 1.32, 0.03);

	const eyeLeft = makeBox(0.08, 0.08, 0.08, materials.eye);
	const eyeRight = eyeLeft.clone();
	eyeLeft.position.set(-0.16, 0.98, 0.36);
	eyeRight.position.set(0.16, 0.98, 0.36);

	group.add(feet, body, chest, wingLeft, wingRight, tail, head, beak, comb, eyeLeft, eyeRight);
	return group;
}

function createTree(offsetX, z) {
	const tree = new THREE.Group();
	const trunk = makeBox(0.28, 0.82, 0.28, materials.log);
	trunk.position.y = 0.41;
	const leavesBase = makeBox(0.92, 0.52, 0.92, materials.grassEdge);
	leavesBase.position.y = 0.96;
	const leavesTop = makeBox(0.66, 0.46, 0.66, materials.grassAlt);
	leavesTop.position.y = 1.38;
	tree.add(trunk, leavesBase, leavesTop);
	tree.position.set(offsetX, 0, z);
	world.add(tree);
}

for (let i = 0; i < 18; i += 1) {
	const x = (Math.random() > 0.5 ? -1 : 1) * (worldHalfWidth + 1.5 + Math.random() * 3.5);
	const z = -4 + i * 1.6;
	createTree(x, z);
}

const player = {
	group: createPlayer(),
	lane: 0,
	xIndex: 0,
	worldX: 0,
	worldZ: 0,
	targetX: 0,
	targetZ: 0,
	moving: false,
	moveTime: 0,
	rideVelocity: 0
};
world.add(player.group);
player.group.traverse((child) => {
	if (child.isMesh) {
		child.castShadow = true;
		child.receiveShadow = true;
	}
});

function laneToWorldZ(index) {
	return index * laneDepth;
}

function xIndexToWorldX(index) {
	return index * laneWidth;
}

function randomFrom(list) {
	return list[Math.floor(Math.random() * list.length)];
}

function createGroundLane(index, type) {
	const lane = new THREE.Group();
	lane.userData.type = type;
	lane.userData.index = index;
	lane.position.z = laneToWorldZ(index);

	const width = (worldHalfWidth * 2 + 3) * laneWidth;
	const baseMaterial = type === 'road' ? materials.road : type === 'water' ? materials.water : materials.grass;
	const edgeMaterial = type === 'road' ? materials.shoulder : type === 'water' ? materials.waterEdge : materials.grassEdge;

	const base = makeBox(width, 0.35, laneDepth, baseMaterial);
	base.receiveShadow = true;
	base.castShadow = false;
	base.position.y = -0.18;
	lane.add(base);

	const edgeA = makeBox(width, 0.16, 0.12, edgeMaterial);
	const edgeB = edgeA.clone();
	edgeA.position.set(0, 0.03, -laneDepth * 0.5 + 0.06);
	edgeB.position.set(0, 0.03, laneDepth * 0.5 - 0.06);
	lane.add(edgeA, edgeB);

	if (type === 'grass') {
		for (let i = 0; i < 14; i += 1) {
			addGrassTuft(lane, (Math.random() - 0.5) * (width - 1.4), (Math.random() - 0.5) * 1.3);
		}
	}

	if (type === 'road') {
		for (let x = -worldHalfWidth - 1; x <= worldHalfWidth + 1; x += 2) {
			const stripe = makeBox(0.9, 0.04, 0.18, materials.laneStripe);
			stripe.position.set(x * laneWidth * 0.5, 0.03, 0);
			stripe.castShadow = false;
			lane.add(stripe);
		}
		const curbLeft = makeBox(0.26, 0.08, laneDepth, materials.curb);
		const curbRight = curbLeft.clone();
		curbLeft.position.set(-width * 0.5 + 0.13, 0.05, 0);
		curbRight.position.set(width * 0.5 - 0.13, 0.05, 0);
		lane.add(curbLeft, curbRight);
	}

	if (type === 'water') {
		for (let x = -worldHalfWidth; x <= worldHalfWidth; x += 1) {
			const ripple = makeBox(0.72, 0.03, 0.14, materials.waterEdge);
			ripple.position.set(x * laneWidth, 0.02, Math.random() * 0.8 - 0.4);
			ripple.castShadow = false;
			lane.add(ripple);
		}
	}

	return lane;
}

function createVehicle(length, color) {
	const group = new THREE.Group();
	const body = makeBox(length, 0.54, 0.98, color);
	body.position.y = 0.38;
	const cabin = makeBox(length * 0.58, 0.36, 0.68, materials.window);
	cabin.position.set(0, 0.8, -0.02);
	const hood = makeBox(length * 0.32, 0.16, 0.86, color);
	hood.position.set(length * 0.14, 0.62, 0);
	const bumperFront = makeBox(0.08, 0.16, 0.9, materials.bumper);
	const bumperBack = bumperFront.clone();
	bumperFront.position.set(length * 0.5 + 0.01, 0.28, 0);
	bumperBack.position.set(-length * 0.5 - 0.01, 0.28, 0);
	const wheelOffsets = [-length * 0.34, length * 0.34];
	wheelOffsets.forEach((offset) => {
		const left = makeBox(0.24, 0.24, 0.22, materials.wheel);
		const right = left.clone();
		left.position.set(offset, 0.12, 0.4);
		right.position.set(offset, 0.12, -0.4);
		group.add(left, right);
	});
	group.add(body, cabin, hood, bumperFront, bumperBack);
	return group;
}

function createLog(length, turtle = false) {
	const group = new THREE.Group();
	const material = turtle ? materials.turtle : materials.log;
	const piece = makeBox(length, 0.34, 0.9, material);
	piece.position.y = 0.2;
	group.add(piece);

	if (turtle) {
		const shell = makeBox(length * 0.42, 0.18, 0.58, materials.turtleShell);
		shell.position.set(0, 0.44, 0);
		const head = makeBox(0.18, 0.12, 0.18, materials.turtle);
		head.position.set(length * 0.3, 0.33, 0);
		group.add(shell, head);
	} else {
		const ringA = makeBox(0.08, 0.24, 0.82, materials.logRing);
		const ringB = ringA.clone();
		ringA.position.set(-length * 0.5 + 0.08, 0.24, 0);
		ringB.position.set(length * 0.5 - 0.08, 0.24, 0);
		group.add(ringA, ringB);
	}

	return group;
}

function laneTypeForIndex(index) {
	if (index <= 1) return 'grass';
	const roll = Math.random();
	if (roll < 0.36) return 'road';
	if (roll < 0.58) return 'water';
	return 'grass';
}

function populateLane(lane) {
	lane.userData.obstacles = [];
	lane.userData.speed = 0;
	lane.userData.direction = 1;
	lane.userData.safeSpots = [];

	const {
		type,
		index
	} = lane.userData;

	if (type === 'grass') {
		lane.userData.safeSpots = [];
		if (index > 2 && Math.random() > 0.34) {
			const blockedSpots = new Set();
			const count = Math.floor(Math.random() * 3) + 1;
			while (blockedSpots.size < count) {
				blockedSpots.add(Math.floor(Math.random() * (worldHalfWidth * 2 + 1)) - worldHalfWidth);
			}
			blockedSpots.forEach((spot) => {
				const tree = new THREE.Group();
				const trunk = makeBox(0.28, 0.82, 0.28, materials.log);
				trunk.position.y = 0.41;
				const leavesBase = makeBox(0.92, 0.52, 0.92, materials.grassEdge);
				leavesBase.position.y = 0.96;
				const leavesTop = makeBox(0.66, 0.46, 0.66, materials.grassAlt);
				leavesTop.position.y = 1.38;
				tree.add(trunk, leavesBase, leavesTop);
				tree.position.set(xIndexToWorldX(spot), 0, 0);
				lane.add(tree);
				lane.userData.safeSpots.push(spot);
			});
		}
		return;
	}

	lane.userData.safeSpots = [];
	lane.userData.direction = Math.random() > 0.5 ? 1 : -1;
	lane.userData.speed = type === 'road' ? 2.2 + Math.random() * 3 : 1.2 + Math.random() * 1.55;
	const minGap = type === 'road' ? 1.8 : 2.4;
	const baseSpacing = type === 'road' ? 6.4 + Math.random() * 1.6 : 6.8 + Math.random() * 1.8;
	const count = 4;

	for (let i = 0; i < count; i += 1) {
		const isTruck = type === 'road' && Math.random() > 0.7;
		const length = type === 'road' ? (isTruck ? 2.35 : 1.5 + Math.random() * 0.42) : 2.05 + Math.random() * 1.45;
		const mesh = type === 'road' ?
			createVehicle(length, randomFrom([materials.carA, materials.carB, materials.carC, materials.truck])) :
			createLog(length, Math.random() > 0.74);

		const previous = lane.userData.obstacles[i - 1];
		const startOffset = i * baseSpacing + Math.random() * 0.8;
		const x = previous ?
			previous.x + lane.userData.direction * ((previous.length * 0.5) + (length * 0.5) + minGap) :
			startOffset * lane.userData.direction;

		const obstacle = {
			mesh,
			length,
			x,
			speed: lane.userData.speed * lane.userData.direction,
			type,
			sinkOffset: Math.random() * Math.PI * 2
		};

		mesh.position.set(obstacle.x, 0, 0);
		lane.add(mesh);
		lane.userData.obstacles.push(obstacle);
	}
}

function buildWorld() {
	lanes.forEach((lane) => world.remove(lane));
	lanes = [];
	for (let i = -visibleBack; i < laneCount; i += 1) {
		const type = laneTypeForIndex(i);
		const lane = createGroundLane(i, type);
		populateLane(lane);
		lanes.push(lane);
		world.add(lane);
	}
}

function getLane(index) {
	return lanes.find((lane) => lane.userData.index === index);
}

function canOccupy(laneIndex, xIndex) {
	if (xIndex < -worldHalfWidth || xIndex > worldHalfWidth) return false;
	const lane = getLane(laneIndex);
	if (!lane) return false;
	if (lane.userData.type !== 'grass') return true;
	return !lane.userData.safeSpots.includes(xIndex);
}

function resetPlayer() {
	player.lane = 0;
	player.xIndex = 0;
	player.worldX = 0;
	player.worldZ = 0;
	player.targetX = 0;
	player.targetZ = 0;
	player.group.position.set(0, 0, 0);
	player.group.rotation.set(0, 0, 0);
	player.moving = false;
	player.moveTime = 0;
	player.rideVelocity = 0;
}

function updateScore(next) {
	score = next;
	scoreValue.textContent = String(score);
	if (score > best) {
		best = score;
		bestValue.textContent = String(best);
		localStorage.setItem('crossy-voxel-best', String(best));
	}
}

function setState(next) {
	gameState = next;
	stateValue.textContent = next.charAt(0).toUpperCase() + next.slice(1);
}

function queueMove(direction) {
	if (gameState !== 'playing') return;
	if (moveQueue.length > 2) return;
	moveQueue.push(direction);
}

function tryMove(direction) {
	if (player.moving) return false;
	let lane = player.lane;
	let xIndex = player.xIndex;
	if (direction === 'up') lane += 1;
	if (direction === 'down') lane -= 1;
	if (direction === 'left') xIndex += 1;
	if (direction === 'right') xIndex -= 1;
	if (lane < 0 || !canOccupy(lane, xIndex)) return false;

	player.lane = lane;
	player.xIndex = xIndex;
	player.targetX = xIndexToWorldX(xIndex);
	player.targetZ = laneToWorldZ(lane);
	player.moving = true;
	player.moveTime = 0;
	player.group.rotation.y = direction === 'left' ? Math.PI * 0.5 : direction === 'right' ? -Math.PI * 0.5 : direction === 'down' ? Math.PI : 0;
	audio.hop();

	if (lane > score) {
		updateScore(lane);
		audio.score();
	}
	return true;
}

function triggerGameOver(reason) {
	if (gameState !== 'playing') return;
	setState('down');
	gameOverText.textContent = reason === 'water' ? `You drifted ${score} rows before the splash.` : `You hopped ${score} rows before becoming road paint.`;
	gameOverOverlay.classList.remove('overlay--hidden');
	gameOverOverlay.setAttribute('aria-hidden', 'false');
	if (reason === 'water') audio.splash();
	else audio.hit();
}

function startGame() {
	audio.resume();
	startOverlay.classList.add('overlay--hidden');
	gameOverOverlay.classList.add('overlay--hidden');
	gameOverOverlay.setAttribute('aria-hidden', 'true');
	buildWorld();
	resetPlayer();
	updateScore(0);
	moveQueue = [];
	setState('playing');
}

function animatePlayer(delta) {
	const moveDuration = 0.16;
	if (player.moving) {
		player.moveTime += delta;
		const t = Math.min(player.moveTime / moveDuration, 1);
		const eased = 1 - Math.pow(1 - t, 3);
		player.worldX += (player.targetX - player.worldX) * Math.min(1, delta * 18);
		player.worldZ += (player.targetZ - player.worldZ) * Math.min(1, delta * 18);
		player.group.position.x = player.worldX;
		player.group.position.z = player.worldZ;
		player.group.position.y = Math.sin(eased * Math.PI) * 0.55;
		if (t >= 1) {
			player.moving = false;
			player.worldX = player.targetX;
			player.worldZ = player.targetZ;
			player.group.position.set(player.worldX, 0, player.worldZ);
		}
	} else {
		player.group.position.y = Math.sin(performance.now() * 0.008) * 0.04;
		if (moveQueue.length) tryMove(moveQueue.shift());
	}
}

function recycleLanes() {
	const minNeeded = player.lane - visibleBack;
	const maxNeeded = player.lane + visibleAhead;
	lanes.forEach((lane) => {
		if (lane.userData.index < minNeeded) {
			lane.userData.index = maxNeeded + Math.floor(Math.random() * 4) + 1;
			lane.position.z = laneToWorldZ(lane.userData.index);
			lane.userData.type = laneTypeForIndex(lane.userData.index);
			while (lane.children.length) lane.remove(lane.children[0]);
			lane.userData.obstacles = [];
			lane.userData.safeSpots = [];
			const rebuilt = createGroundLane(lane.userData.index, lane.userData.type);
			world.remove(lane);
			lanes = lanes.map((entry) => entry === lane ? rebuilt : entry);
			populateLane(rebuilt);
			world.add(rebuilt);
		}
	});
}

function updateLanes(delta) {
	lanes.forEach((lane) => {
		const {
			type,
			obstacles
		} = lane.userData;
		if (!obstacles || !obstacles.length) return;
		obstacles.forEach((obstacle) => {
			obstacle.x += obstacle.speed * delta;
			const wrap = 15;
			if (obstacle.speed > 0 && obstacle.x > wrap) obstacle.x = -wrap;
			if (obstacle.speed < 0 && obstacle.x < -wrap) obstacle.x = wrap;
			obstacle.mesh.position.x = obstacle.x;
			if (type === 'water') {
				obstacle.mesh.position.y = Math.sin(performance.now() * 0.002 + obstacle.sinkOffset) * 0.05;
			}
		});
	});
}

function updateCamera(delta) {
	const targetZ = player.worldZ - 3.8;
	camera.position.z += (targetZ - camera.position.z) * Math.min(1, delta * 3.5);
	camera.position.x += ((player.worldX * 0.2) - camera.position.x) * Math.min(1, delta * 2.8);
	camera.position.y += (12.8 - camera.position.y) * Math.min(1, delta * 2.6);
	camera.lookAt(player.worldX * 0.08, 0.8, player.worldZ + 2.8);
}

function checkCollisions(delta) {
	if (gameState !== 'playing') return;
	const lane = getLane(player.lane);
	if (!lane) return;

	player.rideVelocity = 0;
	if (lane.userData.type === 'road') {
		for (const obstacle of lane.userData.obstacles) {
			if (Math.abs(obstacle.x - player.worldX) < obstacle.length * 0.5 + 0.35) {
				triggerGameOver('road');
				return;
			}
		}
	}

	if (lane.userData.type === 'water') {
		let onLog = null;
		for (const obstacle of lane.userData.obstacles) {
			if (Math.abs(obstacle.x - player.worldX) < obstacle.length * 0.5 + 0.15) {
				onLog = obstacle;
				break;
			}
		}

		if (!onLog && !player.moving) {
			triggerGameOver('water');
			return;
		}

		if (onLog && !player.moving) {
			player.rideVelocity = onLog.speed;
			player.worldX += onLog.speed * delta;
			player.targetX = player.worldX;
			player.group.position.x = player.worldX;
			const clampedIndex = Math.round(player.worldX / laneWidth);
			player.xIndex = clampedIndex;
			if (player.worldX < xIndexToWorldX(-worldHalfWidth) - 0.8 || player.worldX > xIndexToWorldX(worldHalfWidth) + 0.8) {
				triggerGameOver('water');
			}
		}
	}
}

let previousTime = performance.now();

function loop(now) {
	const delta = Math.min((now - previousTime) / 1000, 0.033);
	previousTime = now;
	if (gameState === 'playing') {
		updateLanes(delta);
		animatePlayer(delta);
		checkCollisions(delta);
		recycleLanes();
	} else {
		player.group.position.y = Math.sin(now * 0.006) * 0.05;
	}
	updateCamera(delta);
	renderer.render(scene, camera);
	animationId = requestAnimationFrame(loop);
}

function resize() {
	const width = gameRoot.clientWidth;
	const height = gameRoot.clientHeight;
	renderer.setSize(width, height);
	camera.aspect = width / height;
	camera.updateProjectionMatrix();
}

window.addEventListener('resize', resize);

window.addEventListener('keydown', (event) => {
	const key = event.key.toLowerCase();
	const map = {
		arrowup: 'up',
		w: 'up',
		arrowdown: 'down',
		s: 'down',
		arrowleft: 'left',
		a: 'left',
		arrowright: 'right',
		d: 'right'
	};
	if (map[key]) {
		event.preventDefault();
		queueMove(map[key]);
	}
	if (key === ' ' && gameState !== 'playing') {
		event.preventDefault();
		startGame();
	}
});

let touchStart = null;
gameRoot.addEventListener('pointerdown', (event) => {
	touchStart = {
		x: event.clientX,
		y: event.clientY
	};
});

gameRoot.addEventListener('pointerup', (event) => {
	if (!touchStart) return;
	const dx = event.clientX - touchStart.x;
	const dy = event.clientY - touchStart.y;
	const absX = Math.abs(dx);
	const absY = Math.abs(dy);
	if (Math.max(absX, absY) > 18) {
		queueMove(absX > absY ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'up' : 'down'));
	}
	touchStart = null;
});

touchButtons.forEach((button) => {
	button.addEventListener('click', () => queueMove(button.dataset.move));
});

startButton.addEventListener('click', startGame);
restartButton.addEventListener('click', startGame);
howButton.addEventListener('click', () => {
	const tips = document.querySelector('.overlay__tips');
	tips.scrollIntoView({
		behavior: 'smooth',
		block: 'nearest'
	});
});

muteButton.addEventListener('click', () => {
	muted = !muted;
	audio.setMuted(muted);
	muteButton.setAttribute('aria-pressed', String(muted));
	muteButton.innerHTML = `<i data-lucide="${muted ? 'volume-x' : 'volume-2'}"></i>`;
	lucide.createIcons();
});

buildWorld();
resetPlayer();
resize();
lucide.createIcons();
loop(performance.now());