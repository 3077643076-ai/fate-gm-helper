// 状态效果数据和工具函数

// 状态效果类型枚举
export const StatusType = {
  BUFF: 'BUFF',
  DEBUFF: 'DEBUFF',
  ABNORMAL: 'ABNORMAL'
};

// 状态效果数据
export const STATUS_EFFECTS = {
  [StatusType.BUFF]: [
    '回避', '无敌', '保护', '无敌贯通', '抗性上升', '抗性无效'
  ],
  [StatusType.DEBUFF]: [
    '疲惫', '残废', '迟滞', '诅咒', '技能封印', '宝具封印', '封印', '抗性下降'
  ],
  [StatusType.ABNORMAL]: [
    '中毒', '灼伤', '感电', '石化', '晕眩', '魅惑', '混乱', '恐惧', '抗性破除', '特性赋予'
  ]
};

// 获取所有状态效果
export function getAllStatusEffects() {
  return [
    ...STATUS_EFFECTS[StatusType.BUFF],
    ...STATUS_EFFECTS[StatusType.DEBUFF],
    ...STATUS_EFFECTS[StatusType.ABNORMAL]
  ];
}

// 根据名称获取状态类型
export function getStatusType(effectName) {
  if (STATUS_EFFECTS[StatusType.BUFF].includes(effectName)) {
    return StatusType.BUFF;
  }
  if (STATUS_EFFECTS[StatusType.DEBUFF].includes(effectName)) {
    return StatusType.DEBUFF;
  }
  if (STATUS_EFFECTS[StatusType.ABNORMAL].includes(effectName)) {
    return StatusType.ABNORMAL;
  }
  return StatusType.ABNORMAL;
}

// 获取状态类型的显示名称
export function getStatusTypeDisplayName(type) {
  switch (type) {
    case StatusType.BUFF:
      return '强化状态';
    case StatusType.DEBUFF:
      return '弱化状态';
    case StatusType.ABNORMAL:
      return '异常状态';
    default:
      return '未知状态';
  }
}

// 创建状态效果对象
export function createStatusEffect(name, level = 1) {
  return {
    name,
    type: getStatusType(name),
    level
  };
}

// 格式化状态效果显示文本
export function formatStatusEffectDisplay(effect) {
  if (effect.level > 1) {
    return `${effect.name}(${effect.level})`;
  }
  return effect.name;
}

// 从显示文本解析状态效果
export function parseStatusEffectFromDisplay(displayText) {
  const match = displayText.match(/^(.+?)(?:\((\d+)\))?$/);
  if (match) {
    const name = match[1];
    const level = match[2] ? parseInt(match[2]) : 1;
    return createStatusEffect(name, level);
  }
  return null;
}
