// Read-only official-list hints, never inserted into routes/users.
const seed=require('../data/ghaziabad/officer-hints.json')
function lookup(wardNumber){
 if(!Number.isInteger(wardNumber)||wardNumber<1||wardNumber>100)throw Object.assign(new Error('Ward number 1-100 required'),{status:400})
 const zones=seed.zoneCandidates[String(wardNumber)]||[]
 return {wardNumber,verification:seed.verification,checkedAt:seed.checkedAt,sourceEffectiveDate:seed.sourceEffectiveDate,sources:seed.sources,requiresHumanReview:true,automaticAssignment:false,numberingAlignmentVerified:false,zoneCandidates:zones,zoneAmbiguous:zones.length!==1,officers:seed.officers.filter(o=>o.wardNumbers.includes(wardNumber)).map(o=>({name:o.name,designation:o.designation,sourceWardToken:o.wardTokens[o.wardNumbers.indexOf(wardNumber)],accountBinding:null})),limitations:seed.limitations}
}
module.exports={lookup}
