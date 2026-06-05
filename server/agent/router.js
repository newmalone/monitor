import { INTENT_TYPES } from './intent.js';

class AgentRouter {
  constructor(options = {}) {
    this.handlers = options.handlers || {};
    this.skillsModule = options.skillsModule;
    this.ragModule = options.ragModule;
    this.reportGenerator = options.reportGenerator;
  }

  registerHandler(intentType, handler) {
    this.handlers[intentType] = handler;
  }

  async route(intent, context = {}) {
    const { intent: intentType, params, confidence } = intent;

    // Check for registered custom handler first
    if (this.handlers[intentType]) {
      return await this.handlers[intentType](params, context);
    }

    switch (intentType) {
      case INTENT_TYPES.QUERY_STATS:
        return await this._handleStatsQuery(params, context);

      case INTENT_TYPES.QUERY_DEVICES:
        return await this._handleQueryDevices(params, context);

      case INTENT_TYPES.KNOWLEDGE_QA:
        return await this._handleKnowledgeQA(params, context);

      case INTENT_TYPES.GENERATE_REPORT:
        return await this._handleReportGeneration(params, context);

      case INTENT_TYPES.COMPARE_DATA:
        return await this._handleCompareData(params, context);

      case INTENT_TYPES.FAULT_DIAGNOSIS:
        return await this._handleFaultDiagnosis(params, context);

      case INTENT_TYPES.TREND_ANALYSIS:
        return await this._handleTrendAnalysis(params, context);

      case INTENT_TYPES.HELP:
        return this._handleHelp(params, context);

      default:
        return await this._handleOther(params, context);
    }
  }

  async _handleStatsQuery(params, context) {
    if (this.skillsModule && typeof this.skillsModule.queryStats === 'function') {
      const result = await this.skillsModule.queryStats(params, context);
      return this._formatResponse('stats', result);
    }
    return this._formatResponse('stats', {
      message: '统计数据查询功能暂未接入数据源',
      params,
    });
  }

  async _handleQueryDevices(params, context) {
    if (this.skillsModule && typeof this.skillsModule.queryDevices === 'function') {
      const result = await this.skillsModule.queryDevices(params, context);
      return this._formatResponse('devices', result);
    }
    return this._formatResponse('devices', {
      message: '设备查询功能暂未接入数据源',
      params,
    });
  }

  async _handleKnowledgeQA(params, context) {
    if (this.ragModule && typeof this.ragModule.query === 'function') {
      const result = await this.ragModule.query(context.userInput, params);
      return this._formatResponse('qa', result);
    }
    return this._formatResponse('qa', {
      message: '知识问答功能暂未配置向量数据库',
    });
  }

  async _handleReportGeneration(params, context) {
    if (this.skillsModule && typeof this.skillsModule.generateReport === 'function') {
      const result = await this.skillsModule.generateReport(params, context);
      return this._formatResponse('report', result);
    }
    return this._formatResponse('report', {
      message: '报告生成功能暂未可用',
      params,
    });
  }

  async _handleCompareData(params, context) {
    if (this.skillsModule && typeof this.skillsModule.compareData === 'function') {
      const result = await this.skillsModule.compareData(params, context);
      return this._formatResponse('comparison', result);
    }
    return this._formatResponse('comparison', {
      message: '数据对比功能暂未接入数据源',
      params,
    });
  }

  async _handleFaultDiagnosis(params, context) {
    if (this.skillsModule && typeof this.skillsModule.diagnoseFault === 'function') {
      const result = await this.skillsModule.diagnoseFault(params, context);
      return this._formatResponse('diagnosis', result);
    }
    return this._formatResponse('diagnosis', {
      message: '故障诊断功能暂未可用',
      params,
    });
  }

  async _handleTrendAnalysis(params, context) {
    if (this.skillsModule && typeof this.skillsModule.analyzeTrend === 'function') {
      const result = await this.skillsModule.analyzeTrend(params, context);
      return this._formatResponse('trend', result);
    }
    return this._formatResponse('trend', {
      message: '趋势分析功能暂未可用',
      params,
    });
  }

  _handleHelp() {
    return this._formatResponse('help', {
      message: '我是设备监控助手，可以帮您：\n1. 查询设备统计数据（在线率、离线数、异常数等）\n2. 查询设备列表和详情\n3. 生成监控日报/周报/对比报告\n4. 对比分析不同日期数据\n5. 分析在线率变化趋势\n6. 故障诊断和异常排查\n7. 回答设备运维相关知识\n\n请告诉我您需要什么帮助？',
    });
  }

  async _handleOther(params, context) {
    // Try knowledge QA as fallback
    return await this._handleKnowledgeQA(params, context);
  }

  _formatResponse(type, data) {
    return {
      type,
      data,
      timestamp: new Date().toISOString(),
    };
  }
}

export default AgentRouter;
