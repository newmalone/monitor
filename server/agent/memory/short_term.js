import config from '../../config/agent.js';

const MAX_CONTEXT_MESSAGES = 10;

function getContext(conversationId, conversation) {
  if (!conversation || !conversation.messages) {
    return [];
  }

  const messages = conversation.messages;
  const recent = messages.slice(-MAX_CONTEXT_MESSAGES);

  return recent.map(msg => ({
    role: msg.role,
    content: msg.content,
  }));
}

function setContext(conversationId, conversation, context) {
  if (!conversation.messages) {
    conversation.messages = [];
  }

  conversation.messages.push({
    role: 'system',
    content: JSON.stringify(context),
    metadata: { type: 'context_update' },
    timestamp: new Date().toISOString(),
  });

  return conversation;
}

function extractEntities(history) {
  if (!Array.isArray(history) || history.length === 0) {
    return {};
  }

  const entities = {
    lastUsedDate: null,
    manufacturers: new Set(),
    deviceTypes: new Set(),
    regions: new Set(),
  };

  const manufacturerKeywords = ['海康', '大华', '宇视', '华为', '中兴', '海康威视', 'dahua', 'hikvision'];
  const deviceTypeKeywords = ['摄像头', '雷达', '信号机', '传感器', '道闸', '监控', 'camera', 'radar'];
  const regionKeywords = ['朝阳', '海淀', '东城', '西城', '丰台', '石景山', '通州', '顺义', '昌平', '大兴', '区域', '区'];

  const text = history
    .filter(msg => msg.role === 'user')
    .map(msg => msg.content)
    .join(' ');

  const dateRegex = /(\d{4}[-/]\d{1,2}[-/]\d{1,2})/g;
  const dateMatch = text.match(dateRegex);
  if (dateMatch) {
    entities.lastUsedDate = dateMatch[dateMatch.length - 1];
  }

  for (const keyword of manufacturerKeywords) {
    if (text.includes(keyword)) {
      entities.manufacturers.add(keyword);
    }
  }

  for (const keyword of deviceTypeKeywords) {
    if (text.includes(keyword)) {
      entities.deviceTypes.add(keyword);
    }
  }

  for (const keyword of regionKeywords) {
    if (text.includes(keyword)) {
      entities.regions.add(keyword);
    }
  }

  return {
    lastUsedDate: entities.lastUsedDate,
    manufacturers: [...entities.manufacturers],
    deviceTypes: [...entities.deviceTypes],
    regions: [...entities.regions],
  };
}

export { getContext, setContext, extractEntities };
