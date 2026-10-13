// Opt-in Messaging API adapter. NOT Twilio Verify; NOT a free trial promise.
function create({accountSid,authToken,from,messagingServiceSid,approved=false,fetchImpl=global.fetch}){
 if(!approved||!/^AC[0-9a-f]{32}$/i.test(accountSid||'')||!authToken||(messagingServiceSid&&!/^MG[0-9a-f]{32}$/i.test(messagingServiceSid))||(!/^\+[1-9]\d{7,14}$/.test(from||'')&&!/^MG[0-9a-f]{32}$/i.test(messagingServiceSid||'')))throw new Error('Approved Twilio Messaging route and private credentials required')
 return {async send({to,code,expiresSeconds}){
  if(!/^\+91[6-9]\d{9}$/.test(to||'')||!/^\d{6}$/.test(code||'')||expiresSeconds!==300)throw new Error('Invalid OTP payload')
  const body=new URLSearchParams({To:to,Body:`Your CivicSync verification code is ${code}. It expires in 5 minutes. Do not share it.`})
  if(messagingServiceSid)body.set('MessagingServiceSid',messagingServiceSid);else body.set('From',from)
  const response=await fetchImpl(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,{method:'POST',redirect:'error',signal:AbortSignal.timeout(10000),headers:{Authorization:'Basic '+Buffer.from(accountSid+':'+authToken).toString('base64'),'Content-Type':'application/x-www-form-urlencoded'},body})
  if(!response.ok)throw new Error('SMS provider rejected request')
  let result;try{result=await response.json()}catch{throw new Error('Invalid SMS provider receipt')}
  if(!/^SM[0-9a-f]{32}$/i.test(result.sid||'')||!['accepted','queued','sending','sent','delivered'].includes(result.status))throw new Error('SMS provider did not accept request')
  return {accepted:true,deliveryConfirmed:false}
 }}
}
// Lazy validation: importing this file never connects or sends.
module.exports={create,send:payload=>create({accountSid:process.env.TWILIO_ACCOUNT_SID,authToken:process.env.TWILIO_AUTH_TOKEN,from:process.env.TWILIO_FROM,messagingServiceSid:process.env.TWILIO_MESSAGING_SERVICE_SID,approved:process.env.TWILIO_ROUTE_APPROVED==='true'}).send(payload)}
