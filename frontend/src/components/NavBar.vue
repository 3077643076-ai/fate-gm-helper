<template>
  <header class="header">
    <div class="header-content">
      <RouterLink to="/" class="brand" exact-active-class="active">
        <h1 class="header-title">Fate GM助手</h1>
      </RouterLink>
      <nav>
        <ul class="nav">
          <li><RouterLink to="/" class="nav-link" active-class="active" exact-active-class="active">首页</RouterLink></li>
          <li><RouterLink to="/battle-sheet" class="nav-link" active-class="active">战斗表格</RouterLink></li>
          <li><RouterLink to="/character-card-upload" class="nav-link" active-class="active">角色卡上传</RouterLink></li>
          <li><RouterLink to="/battle-control" class="nav-link" active-class="active">战役控制</RouterLink></li>
          <li><RouterLink to="/skill-record" class="nav-link" active-class="active">技能记录</RouterLink></li>
        </ul>
      </nav>
    </div>
  </header>
</template>

