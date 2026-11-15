const p = require('../src/utils/panelBuilder');
const cfg = require('../src/utils/configManager').DEFAULTS;
for (const cat of Object.keys(p.CATEGORIES)) {
    p.dashboardPayload(cfg, cat).components[0].toJSON();
}
p.panelPayload(cfg).components[0].toJSON();
p.infoPayload(cfg).components[0].toJSON();
p.fieldModal(cfg, 'accentColor').toJSON();
console.log('payloads ok');
