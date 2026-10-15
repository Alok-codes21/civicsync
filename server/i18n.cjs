// Preserve machine fields. Hindi translations cover common responses; explicit fallback for the rest.
const messages={
 'Login required':'लॉगिन आवश्यक है',
 'Login required; use assisted desk for offline intake':'लॉगिन करें; ऑफलाइन शिकायत के लिए सहायता डेस्क का उपयोग करें',
 'Invalid username or password':'उपयोगकर्ता नाम या पासवर्ड गलत है',
 'not logged in':'लॉगिन नहीं किया गया है',
 'Invalid coordinates':'स्थान के निर्देशांक गलत हैं',
 'Invalid accuracy':'स्थान की सटीकता गलत है',
 'Invalid priority':'प्राथमिकता गलत है',
 'Invalid category':'शिकायत की श्रेणी गलत है',
 'Invalid hazard code':'खतरे का कोड गलत है',
 'Complaint not found':'शिकायत नहीं मिली',
 'Supervisor required':'पर्यवेक्षक की अनुमति आवश्यक है',
 'Reviewer required':'समीक्षक की अनुमति आवश्यक है',
 'Staff login required':'कर्मचारी लॉगिन आवश्यक है',
 'Private evidence access required':'निजी सबूत देखने की अनुमति आवश्यक है',
 'Private access required':'निजी जानकारी की अनुमति आवश्यक है',
 'Assigned officer or supervisor required':'नियुक्त अधिकारी या पर्यवेक्षक की अनुमति आवश्यक है',
 'A reason of at least 5 characters is required':'कम से कम 5 अक्षरों का कारण दें',
 'lat and lon required':'अक्षांश और देशांतर आवश्यक हैं',
 'title required':'शीर्षक आवश्यक है',
 'description required':'विवरण आवश्यक है',
 'ward required':'वार्ड आवश्यक है',
 'PNG/JPEG base64 required':'PNG या JPEG फोटो का base64 आवश्यक है',
 'Image decode failed or pixel limit exceeded':'फोटो पढ़ी नहीं जा सकी या पिक्सेल सीमा पार हो गई',
 'Idempotency key payload conflict':'इसी अनुरोध कुंजी के साथ अलग जानकारी भेजी गई है',
 'Invalid or oversized request':'अनुरोध गलत है या बहुत बड़ा है',
 'Internal server error':'सर्वर में त्रुटि हुई',
 'Only complaint owner may reopen':'केवल शिकायतकर्ता दोबारा शिकायत खोल सकता है',
 'Only resolved complaints can reopen':'केवल हल की गई शिकायत दोबारा खुल सकती है',
 'Accept assignment first':'पहले काम स्वीकार करें',
 'Invalid intake channel':'शिकायत दर्ज करने का माध्यम गलत है'
}
const strings={en:{submitted:'Complaint recorded; human review required',offline:'Save locally and retry with the same Idempotency-Key when connected',risk:'History-based review hint, not a trained prediction'},hi:{submitted:'शिकायत दर्ज हुई; मानव समीक्षा आवश्यक है',offline:'स्थानीय रूप से सहेजें और इंटरनेट आने पर वही Idempotency-Key भेजें',risk:'पिछली शिकायतों पर आधारित संकेत, प्रशिक्षित भविष्यवाणी नहीं'}}
function middleware(req,res,next){const raw=req.headers['accept-language']||req.query.lang||'en';const code=(typeof raw==='string'?raw:'en').split(',')[0].split('-')[0];const lang=code==='hi'?'hi':'en';const json=res.json.bind(res);res.json=value=>{if(value&&typeof value==='object'&&!Array.isArray(value)){if(value.error){const translated=lang==='hi'?messages[value.error]:value.error;value={...value,error:translated||value.error,language:lang,translationFallback:!translated}}else if(value.acknowledgementNumber)value={...value,message:strings[lang].submitted,language:lang}}return json(value)};next()}
module.exports={middleware,strings,messages}
