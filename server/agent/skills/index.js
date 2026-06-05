import { DeviceStats } from './device_stats.js';
import { Comparison } from './comparison.js';
import { ReportGen } from './report_gen.js';
import { TrendAnalysis } from './trend_analysis.js';
import { FaultDiagnosis } from './fault_diagnosis.js';

class SkillsModule {
  constructor() {
    this.deviceStats = null;
    this.comparison = null;
    this.reportGen = null;
    this.trendAnalysis = null;
    this.faultDiagnosis = null;
    this.initialized = false;
  }

  async init() {
    if (this.initialized) return;

    this.deviceStats = new DeviceStats();
    this.comparison = new Comparison();
    this.reportGen = new ReportGen();
    this.trendAnalysis = new TrendAnalysis();
    this.faultDiagnosis = new FaultDiagnosis();
    this.initialized = true;

    return this;
  }

  async queryStats(params, context) {
    if (!this.initialized) await this.init();
    return await this.deviceStats.queryStats(params, context);
  }

  async queryDevices(params, context) {
    if (!this.initialized) await this.init();
    return await this.deviceStats.queryDevices(params, context);
  }

  async compareData(params, context) {
    if (!this.initialized) await this.init();
    return await this.comparison.compare(params, context);
  }

  async generateReport(params, context) {
    if (!this.initialized) await this.init();
    return await this.reportGen.generate(params, context);
  }

  async diagnoseFault(params, context) {
    if (!this.initialized) await this.init();
    return await this.faultDiagnosis.diagnose(params, context);
  }

  async listAbnormalDevices(params, context) {
    if (!this.initialized) await this.init();
    return await this.faultDiagnosis.listAbnormalDevices(params, context);
  }

  async getBreakdown(params, context) {
    if (!this.initialized) await this.init();
    return await this.deviceStats.getBreakdown(params, context);
  }

  async analyzeTrend(params, context) {
    if (!this.initialized) await this.init();
    return await this.trendAnalysis.analyze(params, context);
  }
}

const instance = new SkillsModule();

export { SkillsModule };
export default instance;