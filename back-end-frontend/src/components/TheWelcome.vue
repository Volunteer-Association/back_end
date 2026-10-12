<script setup lang="ts">
import WelcomeItem from './WelcomeItem.vue'
import DocumentationIcon from './icons/IconDocumentation.vue'
import ToolingIcon from './icons/IconTooling.vue'
import EcosystemIcon from './icons/IconEcosystem.vue'
</script>

<template>
  <div class="navigation-section">
    <h2>功能导航</h2>
    <div class="nav-grid">
      <div class="nav-item">
        <h3>用户认证</h3>
        <router-link to="/login" class="nav-link">
          <el-button type="primary" size="large">用户登录</el-button>
        </router-link>
        <p>测试前后端登录接口</p>
      </div>

      <div class="nav-item">
        <h3>API测试</h3>
        <router-link to="/api-test" class="nav-link">
          <el-button type="success" size="large">API接口测试</el-button>
        </router-link>
        <p>测试所有后端API接口</p>
      </div>

      <div class="nav-item">
        <h3>文件上传</h3>
        <router-link to="/upload" class="nav-link">
          <el-button type="warning" size="large">文件上传</el-button>
        </router-link>
        <p>测试文件上传功能</p>
      </div>

      <div class="nav-item">
        <h3>AI演示</h3>
        <router-link to="/aidemo" class="nav-link">
          <el-button type="info" size="large">AI功能演示</el-button>
        </router-link>
        <p>TensorFlow.js AI功能</p>
      </div>

      <div class="nav-item">
        <h3>3D展示</h3>
        <router-link to="/web3d" class="nav-link">
          <el-button type="danger" size="large">3D场景</el-button>
        </router-link>
        <p>Three.js 3D展示</p>
      </div>

      <div class="nav-item">
        <h3>关于页面</h3>
        <router-link to="/about" class="nav-link">
          <el-button size="large">关于我们</el-button>
        </router-link>
        <p>项目信息介绍</p>
      </div>
    </div>
  </div>

  <div class="project-info">
    <WelcomeItem>
      <template #icon>
        <DocumentationIcon />
      </template>
      <template #heading>项目说明</template>
      
      这是一个完整的前后端分离项目，展示了Vue 3 + NestJS的技术栈集成。
      项目包含了用户认证、API调用、文件上传、AI功能演示等完整功能。
    </WelcomeItem>

    <WelcomeItem>
      <template #icon>
        <ToolingIcon />
      </template>
      <template #heading>技术栈</template>

      <strong>前端:</strong> Vue 3 + TypeScript + Vite + Element Plus<br>
      <strong>后端:</strong> NestJS + TypeScript + MySQL<br>
      <strong>开发工具:</strong> VSCode + Volar
    </WelcomeItem>

    <WelcomeItem>
      <template #icon>
        <EcosystemIcon />
      </template>
      <template #heading>功能特性</template>

      • 前后端接口完全打通<br>
      • JWT Token认证机制<br>
      • 文件上传与下载<br>
      • RESTful API设计<br>
      • 响应式界面设计
    </WelcomeItem>
  </div>
</template>

<style scoped>
.navigation-section {
  margin-bottom: 40px;
}

.navigation-section h2 {
  text-align: center;
  color: #333;
  margin-bottom: 30px;
  font-size: 28px;
}

.nav-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 260px), 1fr));
  gap: 20px;
  margin-bottom: 40px;
}

.nav-item {
  background: #f8f9fa;
  padding: 20px;
  border-radius: 8px;
  text-align: center;
  border: 1px solid #e9ecef;
  transition: all 0.3s ease;
}

.nav-item:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.nav-item h3 {
  color: #495057;
  margin-bottom: 15px;
  font-size: 18px;
}

.nav-link {
  text-decoration: none;
  display: block;
  margin-bottom: 10px;
}

.nav-item p {
  color: #6c757d;
  font-size: 14px;
  margin: 0;
}

.project-info {
  max-width: 800px;
  margin: 0 auto;
}
</style>
