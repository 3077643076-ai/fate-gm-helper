// 路由入口参数校验工具：先把脏数据挡在数据库外面。
function parseRequiredId(value, fieldName, res) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: `${fieldName} 必须是正整数` });
    return null;
  }
  return id;
}

module.exports = { parseRequiredId };
