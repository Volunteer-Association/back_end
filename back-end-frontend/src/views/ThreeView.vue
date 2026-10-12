<template>
    <div ref="canvasContainer" class="three-container"></div>
</template>
<script lang="ts" setup>
import { ref, onMounted, onUnmounted } from 'vue';
import * as THREE from "three";
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
// 1. 获取DOM容器
const canvasContainer = ref<HTMLDivElement | null>(null)

// 2. 声明Three.js核心对象
const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
)
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
let controls: OrbitControls
let animationId: number

// 3. 初始化场景
const initScene = () => {
    if (!canvasContainer.value) return

    // 创建立方体
    const geometry = new THREE.BoxGeometry(1, 1, 1)
    const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 })
    const cube = new THREE.Mesh(geometry, material)
    scene.add(cube)

    // 设置相机位置
    camera.position.z = 5

    // 配置渲染器
    renderer.setSize(canvasContainer.value.clientWidth, canvasContainer.value.clientHeight)
    renderer.setPixelRatio(window.devicePixelRatio)
    canvasContainer.value.appendChild(renderer.domElement)

    // 添加轨道控制器
    controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
}

// 4. 动画循环
const animate = () => {
    animationId = requestAnimationFrame(animate)
    controls.update()
    // camera.position.z = 5
    camera.position.x = Math.sin(Date.now() * 0.001) * 5
    camera.position.y = Math.cos(Date.now() * 0.001) * 5
    camera.lookAt(scene.position)
    renderer.render(scene, camera)
}

// 5. 窗口自适应
const onWindowResize = () => {
    if (!canvasContainer.value) return

    camera.aspect = canvasContainer.value.clientWidth / canvasContainer.value.clientHeight;
    camera.updateProjectionMatrix()
    renderer.setSize(canvasContainer.value.clientWidth, canvasContainer.value.clientHeight)
}

// 6. 清理资源
const cleanup = () => {
    window.removeEventListener('resize', onWindowResize)
    cancelAnimationFrame(animationId)
    canvasContainer.value?.removeChild(renderer.domElement)

    // 释放内存
    scene.traverse(object => {
        if (object instanceof THREE.Mesh) {
            object.geometry.dispose()
            if (Array.isArray(object.material)) {
                object.material.forEach(m => m.dispose())
            } else {
                object.material.dispose()
            }
        }
    })
}

// 生命周期钩子
onMounted(() => {
    initScene()
    animate()
    window.addEventListener('resize', onWindowResize)
})

onUnmounted(() => {
    cleanup()
})
</script>
<style lang="css">
body {
    all: unset;
}

#app {
    all: unset;
}

.three-container {
    width: 100%;
    height: 100vh;
    overflow: hidden; 
    /** 解决画布不居中 */
    display: flex;
    justify-content: center;
    align-items: center;
    /* position: relative; */
}
.three-container canvas {
    display: block;
}

</style>