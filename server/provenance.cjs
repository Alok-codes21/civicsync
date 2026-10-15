// Integration point: inspect ORIGINAL bytes before Sharp strips metadata.
// No validator is bundled. Never promote a client declaration to validated provenance.
async function inspectOriginal(_bytes){return {status:'unsupported',signerSummary:null,actionSummary:null,validated:false}}
module.exports={inspectOriginal}
