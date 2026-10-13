const sharp=require('sharp')
// Difference hash detects some resize/recompression changes. It is not an edit/AI detector.
async function inspect(bytes){
 const image=sharp(bytes,{limitInputPixels:16000000,failOn:'error'}),meta=await image.metadata()
 if(!['png','jpeg'].includes(meta.format)||meta.pages>1)throw new Error('Unsupported image')
 const pixels=await image.rotate().flatten({background:'#ffffff'}).resize(9,8,{fit:'fill'}).greyscale().raw().toBuffer()
 let bits=0n;for(let y=0;y<8;y++)for(let x=0;x<8;x++)bits=(bits<<1n)|BigInt(pixels[y*9+x]>pixels[y*9+x+1])
 return {dhash:bits.toString(16).padStart(16,'0'),width:meta.width,height:meta.height,lowInformation:new Set(pixels).size<8}
}
function hamming(a,b){let n=BigInt('0x'+a)^BigInt('0x'+b),d=0;while(n){d+=Number(n&1n);n>>=1n}return d}
module.exports={inspect,hamming}
