import {test,expect} from '@playwright/test';
test('settings install progress, ready connection, and stop',async({page})=>{
 let state='absent'; const actions:string[]=[];
 const config={enabled:false,whisperUrl:'http://127.0.0.1:8178/inference',breezeUrl:'http://127.0.0.1:7860/v1/audio/speech',instruction:'Clear speech',voice:'design',runtime:'breeze',language:'auto',cfgScale:4};
 await page.route('**/api/voice',r=>r.fulfill({json:{...config,enabled:state==='running'}}));
 await page.route('**/api/voice/install',async r=>{
  if(r.request().method()==='POST'){actions.push('install');state='starting';return r.fulfill({json:{ok:true}});}
  return r.fulfill({json:{available:true,state,busy:false,progress:state==='starting'?'Quantizing Breeze to Q8_0 on CPU':'',error:''}});
 });
 await page.route('**/api/voice/stop',r=>{actions.push('stop');state='stopped';return r.fulfill({json:{ok:true}});});
 await page.goto('/tests/voice-addon.html');
 await page.getByRole('button',{name:'Install voice',exact:true}).click();
 await expect(page.getByLabel('Voice setup log')).toContainText('Quantizing');
 await expect(page.getByRole('button',{name:'Start voice',exact:true})).toBeDisabled();
 state='running';
 await expect(page.getByRole('checkbox',{name:'Enable voice controls in sessions'})).toBeChecked({timeout:8000});
 await page.getByRole('button',{name:'Stop · release VRAM'}).click();
 await expect(page.getByRole('button',{name:'Start voice',exact:true})).toBeEnabled();
 expect(actions).toEqual(['install','stop']);
 await page.screenshot({path:'/tmp/pithagoras-voice-addon.png'});
});
