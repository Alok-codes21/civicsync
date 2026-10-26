// Integrated-host startup only: the API listens on loopback, behind our wrapper.
// No signup/login policy changes. Direct `npm start` retains its original behavior.
const {app,sweep,retention}=require('../server/index.cjs');
app.set('trust proxy','loopback');
app.listen(Number(process.env.PORT||3001),'127.0.0.1',()=>{sweep();retention();console.log('CivicSync integrated API ready');});
