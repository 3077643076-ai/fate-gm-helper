// 递归拷贝目录（唯一实现，工具脚本和后端都走这里）
//
// ⚠️ 千万别用 fs.cpSync 干这件事：Node 在 Windows 上碰到**非 ASCII 的目标路径**会把它按 GBK 解码，
//    目录会建到乱码名字里去，连路径分隔符都可能被当双字节字符吃掉。实测（Node v22/24）：
//      fs.cpSync(src, 'X:\\tmp\\圣杯GM工作台\\napcat')   // 期望在 圣杯GM工作台 下建 napcat
//      → 实际建出同级乱码目录 '鍦ｆ澂GM宸ヤ綔鍙癨napcat'（'\' 被当作 GBK 双字节的第二字节吞掉）
//    换成 mkdirSync + copyFileSync 逐层来就完全正常（同为 Node fs 接口，只有 cpSync 有这个坑）。
//    这个坑会实打实坑到分发包：别人把工作台解压到中文目录，内置 NapCat 就释放不出来。
const fs = require('node:fs');
const path = require('node:path');

/**
 * 把 src 目录的内容递归拷进 dest（dest 不存在会创建）。
 * @returns {number} 拷贝的文件数
 */
function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  let copied = 0;
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copied += copyDirSync(from, to);
    } else if (entry.isSymbolicLink()) {
      continue; // 不跟符号链接，避免拷出目录外面去
    } else {
      fs.copyFileSync(from, to);
      copied++;
    }
  }
  return copied;
}

module.exports = { copyDirSync };
