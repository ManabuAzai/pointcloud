import { useEffect } from 'react';
import './App.css';
import * as THREE from 'three';

// Canvasを取得する関数
function getCanvas(): HTMLCanvasElement {
  // Canvasの取得
  return document.getElementById("canvas") as HTMLCanvasElement;
}

// Sceneを作成する関数
function createScene(): THREE.Scene {
  // Sceneの設定
  return new THREE.Scene();
}

// Cameraを作成する関数
function createCamera(sizes: { width: number, height: number }): THREE.PerspectiveCamera {
  // Cameraの設定
  const camera = new THREE.PerspectiveCamera(75, sizes.width / sizes.height, 1, 1000);

  // 映像の左側3/4部分を切り取る
  const fullWidth = sizes.width;
  const fullHeight = sizes.height;
  const xOffset = 250; // 左側から切り取るのでオフセットは0
  const yOffset = fullHeight * 0.125; // 上下の中心をとるためのオフセット
  const width = fullWidth * 0.6;
  const height = fullHeight * 0.6;

  camera.setViewOffset(fullWidth, fullHeight, xOffset, yOffset, width, height);

  return camera;
}

// Lightを作成する関数
function createLight(): THREE.AmbientLight {
  // Lightの設定
  return new THREE.AmbientLight(0xffffff, 1);
}

// Rendererを作成する関数
function createRenderer(canvas: HTMLCanvasElement, sizes: { width: number, height: number }): THREE.WebGLRenderer {
  // Rendererの設定
  const renderer = new THREE.WebGLRenderer({
    canvas: canvas,
    antialias: true,
    alpha: true
  });
  renderer.setSize(sizes.width, sizes.height);
  renderer.setPixelRatio(window.devicePixelRatio);
  return renderer;
}

// カメラのアニメーションを設定
function setupCameraAnimation(camera: THREE.PerspectiveCamera, renderer: THREE.WebGLRenderer, scene: THREE.Scene) {
  let time = 0; // 時間の初期値
  // const frequency = 3; // 揺れの周波数
  let angle = 2.3; // 初期角度
  const radius = 2; // 半径
  const angularSpeed = 0.006; // 角速度（ラジアン/フレーム）
  // const lookAtAmplitude = 0.06; // lookAtの振幅

  const tick = () => {
    // カメラの位置を更新
    camera.position.x = radius * Math.cos(angle);
    camera.position.y = radius * Math.sin(angle);
    camera.position.z = 0;
    camera.up.set(0, 0, 1);
    // カメラを原点に向ける
    camera.lookAt(0, 0, 0);
    // camera.lookAt(0, lookAtAmplitude * Math.sin(frequency * time), lookAtAmplitude * Math.cos(frequency * time));
    // 角度を更新
    angle += angularSpeed;
    time += 0.01;
    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

// 座標データの非同期読み込み
async function fetchCoordinates(filename: string): Promise<THREE.Vector3[]> {
  const response = await fetch(`./models/${filename}`);
  const text = await response.text();
  const lines = text.split('\n');
  return lines.map(line => {
    const [x, y, z] = line.split(',').map(Number);
    return new THREE.Vector3(x, y, z);
  });
}

// 座標データから立方体を作成（InstancedMeshを使用）
function createCuboidsFromCoordinates(coords: THREE.Vector3[], material: THREE.Material): THREE.InstancedMesh {
  const geometry = new THREE.BoxGeometry(0.003, 0.003, 0.003);
  const instancedMesh = new THREE.InstancedMesh(geometry, material, coords.length);
  const dummy = new THREE.Object3D();
  coords.forEach((coord, i) => {
    dummy.position.copy(coord);
    dummy.updateMatrix();
    instancedMesh.setMatrixAt(i, dummy.matrix);
  });
  instancedMesh.instanceMatrix.needsUpdate = true;
  return instancedMesh;
}

// Point Cloudの作成を行う関数
async function createPointCloud(scene: THREE.Scene): Promise<{ instancedMesh: THREE.InstancedMesh, StartCoords: THREE.Vector3[], GoalCoords: THREE.Vector3[], StartColor: THREE.Color, GoalColor: THREE.Color }> {
  const [StartCoords, GoalCoords] = await Promise.all([
    fetchCoordinates('coordinates_bird_s.txt'),
    fetchCoordinates('coordinates_bird_g.txt')
  ]);
  
  const StartColor = new THREE.Color(0xe7ecfe);
  const GoalColor = new THREE.Color(0xe7ecfe);
  const material = new THREE.MeshBasicMaterial({ color: StartColor }); 
  const instancedMesh = createCuboidsFromCoordinates(StartCoords, material);
  scene.add(instancedMesh);

  return { instancedMesh, StartCoords, GoalCoords, StartColor, GoalColor };
}

// Point Cloudのアニメーションを設定
function getNextAnimationStage(currentStage: string): {start: string, end: string} {
  switch(currentStage) {
    case 'Start':
      return {start: 'Start', end: 'Goal'};
    case 'Goal':
      return {start: 'Goal', end: 'Start'};
    default:
      return {start: 'Start', end: 'Goal'};
  }
}
let animateEndName: string = 'Start';

function animateFromTo(instancedMesh: THREE.InstancedMesh, startName: string, coordMapping: { [key: string]: THREE.Vector3[] }, colorMapping: { [key: string]: THREE.Color }, endName: string, renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
  const startCoords = coordMapping[startName];
  const endCoords = coordMapping[endName];
  const startColor = colorMapping[startName];
  const endColor = colorMapping[endName];
  let startTime: number | null = null;
  let animationFrameId: number | null = null;

  function easeInOut(t: number): number {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  const duration = startName === "Start" && endName === "Goal" ? 300 : 700;

  const tick = (time: number) => {
    if (startTime === null) {
      startTime = time;
    }
    const elapsedTime = time - startTime;
    const dummy = new THREE.Object3D();

    if (elapsedTime <= duration) {
      const t = easeInOut(elapsedTime / duration);
      const currentColor = new THREE.Color().lerpColors(startColor, endColor, t);

      if (Array.isArray(instancedMesh.material)) {
        instancedMesh.material.forEach(mat => {
          if (mat instanceof THREE.MeshBasicMaterial) {
            mat.color = currentColor;
          }
        });
      } else if (instancedMesh.material instanceof THREE.MeshBasicMaterial) {
        instancedMesh.material.color = currentColor;
      }

      startCoords.forEach((start, i) => {
        const end = endCoords[i];
        dummy.position.lerpVectors(start, end, t);
        dummy.updateMatrix();
        instancedMesh.setMatrixAt(i, dummy.matrix);
      });

      instancedMesh.instanceMatrix.needsUpdate = true;
      renderer.render(scene, camera);
      animationFrameId = requestAnimationFrame(tick);
    } else {
      animateEndName = endName;
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
      }

      const nextStage = getNextAnimationStage(animateEndName);
      animateFromTo(instancedMesh, nextStage.start, coordMapping, colorMapping, nextStage.end, renderer, scene, camera);
    }
  };

  animationFrameId = requestAnimationFrame(tick);
}

// Appコンポーネント
function App() {
  let currentMesh: THREE.InstancedMesh | null = null;

  useEffect(() => {
    const canvas = getCanvas();
    const sizes = { width: window.innerWidth, height: window.innerHeight };
    const scene = createScene();
    const camera = createCamera(sizes);
    const ambientLight = createLight();
    scene.add(ambientLight);
    const renderer = createRenderer(canvas, sizes);

    setupCameraAnimation(camera, renderer, scene);

    const animateSection = () => {
      const prevMesh = currentMesh;

      createPointCloud(scene).then(({ instancedMesh, StartCoords, GoalCoords, StartColor, GoalColor }) => {
        currentMesh = instancedMesh;
        const coordMapping = {'Start': StartCoords, 'Goal': GoalCoords};
        const colorMapping = {'Start': StartColor, 'Goal': GoalColor};
        if (instancedMesh) {
          animateFromTo(instancedMesh, animateEndName, coordMapping, colorMapping, getNextAnimationStage(animateEndName).end, renderer, scene, camera);
        }
        setTimeout(() => {
          if (prevMesh) {
            scene.remove(prevMesh);
          }
        }, 1);
      });
    };

    // ページの読み込み時にアニメーションを開始
    animateSection();

    return () => {
      if (currentMesh) {
        scene.remove(currentMesh);
      }
    };
  }, []);

  return (
    <>
      <canvas id="canvas"></canvas>
      <div id="Section1">
        <h2>XXX</h2>
        <p>YYY</p>
      </div>
      <div id="Section2">
        <h2>XXX</h2>
        <p>YYY</p>
      </div>
      <div id="Section3">
        <h2>XXX</h2>
        <p>YYY</p>
      </div>
    </>
  );
}

export default App;