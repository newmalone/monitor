export const INTENT_TYPES = {
  QUERY_STATS: 'query_stats',
  QUERY_DEVICES: 'query_devices',
  GENERATE_REPORT: 'generate_report',
  COMPARE_DATA: 'compare_data',
  KNOWLEDGE_QA: 'knowledge_qa',
  FAULT_DIAGNOSIS: 'fault_diagnosis',
  TREND_ANALYSIS: 'trend_analysis',
  HELP: 'help',
  OTHER: 'other',
};

export async function parseIntent(userInput, context = {}, llmClient) {
  console.log(`[Intent] Parsing: "${userInput}"`);

  // First try rule-based parsing (fast, no API needed)
  const ruleResult = tryRuleBasedParse(userInput);
  if (ruleResult && ruleResult.confidence >= 0.7) {
    console.log(`[Intent] Rule-based match: ${ruleResult.intent} (confidence: ${ruleResult.confidence})`);
    return ruleResult;
  }

  // Try LLM-based parsing for more complex queries
  if (llmClient) {
    try {
      const result = await llmClient.parseIntent(userInput, context);
      if (result.confidence > 0.5) {
        console.log(`[Intent] LLM parsed: ${result.intent} (confidence: ${result.confidence})`);
        return result;
      }
    } catch (error) {
      console.error('LLM intent parsing error:', error.message);
    }
  }

  // Fall back to rule-based
  return ruleResult || fallbackParse(userInput);
}

// Extracted rule-based parsing for reuse
export function tryRuleBasedParse(userInput) {
  return _ruleBasedParse(userInput);
}

function _ruleBasedParse(userInput) {
  const lower = userInput.toLowerCase();
  const params = extractParams(userInput);
  const date = extractDate(userInput);

  if (date) {
    params.date = date;
  }

  // Special handling: queries with "多少" about online/offline are stats queries
  if ((lower.includes('多少') || lower.includes('几台') || lower.includes('有几个')) &&
      (lower.includes('在线') || lower.includes('离线') || lower.includes('异常') || lower.includes('启用') || lower.includes('设备'))) {
    return {
      intent: INTENT_TYPES.QUERY_STATS,
      params,
      confidence: 0.7,
    };
  }

  const rules = [
    {
      keywords: ['故障', '异常', '离线设备', '排查', '为什么离线', '不在线', '掉线'],
      intent: INTENT_TYPES.FAULT_DIAGNOSIS,
      confidence: 0.7,
    },
    {
      keywords: ['趋势', '变化趋势', '近几天', '本周趋势', '近一周', '月度趋势', '周趋势', '月趋势'],
      intent: INTENT_TYPES.TREND_ANALYSIS,
      confidence: 0.7,
    },
    {
      keywords: ['对比', '比较', '增长率', '和昨天', '和今天', '较昨日'],
      intent: INTENT_TYPES.COMPARE_DATA,
      confidence: 0.6,
    },
    {
      keywords: ['统计', '在线率', '故障率', '离线数量', '在线数量', '多少台', '汇总'],
      intent: INTENT_TYPES.QUERY_STATS,
      confidence: 0.6,
    },
    {
      keywords: ['设备列表', '设备信息', '哪些设备', '设备详情', '查设备', '列出所有', '查看所有'],
      intent: INTENT_TYPES.QUERY_DEVICES,
      confidence: 0.6,
    },
    {
      keywords: ['报告', '报表', '生成报告', '导出报告', '日报', '周报', '月报'],
      intent: INTENT_TYPES.GENERATE_REPORT,
      confidence: 0.7,
    },
    {
      keywords: ['帮助', '怎么用', '如何使用', '功能介绍', '你能做什么'],
      intent: INTENT_TYPES.HELP,
      confidence: 0.8,
    },
  ];

  for (const rule of rules) {
    if (rule.keywords.some(kw => lower.includes(kw))) {
      return {
        intent: rule.intent,
        params,
        confidence: rule.confidence,
      };
    }
  }

  // Check if it's a question (knowledge QA)
  if (lower.includes('?') || lower.includes('？') || lower.includes('什么') || lower.includes('为什么') || lower.includes('怎么')) {
    return {
      intent: INTENT_TYPES.KNOWLEDGE_QA,
      params,
      confidence: 0.4,
    };
  }

  return {
    intent: INTENT_TYPES.OTHER,
    params,
    confidence: 0.2,
  };
}

export function fallbackParse(userInput) {
  return _ruleBasedParse(userInput);
}

export function extractDate(userInput) {
  const lower = userInput.toLowerCase();

  const today = new Date();

  if (lower.includes('今天') || lower.includes('当日') || lower.includes('当日')) {
    return formatDate(today);
  }
  if (lower.includes('昨天') || lower.includes('昨日')) {
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    return formatDate(yesterday);
  }
  if (lower.includes('前天')) {
    const dayBefore = new Date(today);
    dayBefore.setDate(dayBefore.getDate() - 2);
    return formatDate(dayBefore);
  }
  if (lower.includes('本周') || lower.includes('这周')) {
    return formatDate(getWeekStart(today));
  }
  if (lower.includes('上周')) {
    const lastWeek = new Date(today);
    lastWeek.setDate(lastWeek.getDate() - 7);
    return formatDate(getWeekStart(lastWeek));
  }
  if (lower.includes('本月') || lower.includes('这个月')) {
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  }

  // Match YYYY-MM-DD or YYYY/MM/DD
  const dateRegex = /(\d{4})[-/](\d{1,2})[-/](\d{1,2})/;
  const match = userInput.match(dateRegex);
  if (match) {
    const year = parseInt(match[1], 10);
    const month = parseInt(match[2], 10);
    const day = parseInt(match[3], 10);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  // Match YYYY-MM (month only)
  const monthRegex = /(\d{4})[-/](\d{1,2})/;
  const monthMatch = userInput.match(monthRegex);
  if (monthMatch) {
    const year = parseInt(monthMatch[1], 10);
    const month = parseInt(monthMatch[2], 10);
    if (month >= 1 && month <= 12) {
      return `${year}-${String(month).padStart(2, '0')}`;
    }
  }

  return null;
}

export function extractParams(userInput) {
  const params = {};

  const manufacturerMap = {
    '海康': '海康威视',
    '海康威视': '海康威视',
    '大华': '大华',
    '宇视': '宇视',
    '华为': '华为',
  };

  const deviceTypeMap = {
    '摄像头': '摄像头',
    '监控': '摄像头',
    'camera': '摄像头',
    '雷达': '雷达',
    'radar': '雷达',
    '信号机': '信号机',
    '传感器': '传感器',
    '道闸': '道闸',
  };

  const regionMap = {
    '朝阳': '朝阳区',
    '海淀': '海淀区',
    '东城': '东城区',
    '西城': '西城区',
    '丰台': '丰台区',
    '石景山': '石景山区',
    '通州': '通州区',
    '顺义': '顺义区',
    '昌平': '昌平区',
    '大兴': '大兴区',
  };

  const metricMap = {
    '在线率': 'online_rate',
    '离线': 'offline',
    '故障': 'fault',
    '故障率': 'fault_rate',
    '设备数量': 'device_count',
    '启用': 'enabled',
  };

  for (const [keyword, value] of Object.entries(manufacturerMap)) {
    if (userInput.includes(keyword)) {
      params.manufacturer = value;
      break;
    }
  }

  for (const [keyword, value] of Object.entries(deviceTypeMap)) {
    if (userInput.includes(keyword)) {
      params.deviceType = value;
      break;
    }
  }

  for (const [keyword, value] of Object.entries(regionMap)) {
    if (userInput.includes(keyword)) {
      params.region = value;
      break;
    }
  }

  for (const [keyword, value] of Object.entries(metricMap)) {
    if (userInput.includes(keyword)) {
      params.metric = value;
      break;
    }
  }

  return params;
}

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getWeekStart(date) {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  return d;
}
