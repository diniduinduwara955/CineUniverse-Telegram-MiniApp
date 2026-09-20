import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';

function htmlEscape(value){
  return String(value ?? '')
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
}

function urls(){
  return {
    bot: process.env.TELEGRAM_BOT_URL || 'https://t.me/CINE_UNIVERSE_OFFCIALS_BOT',
    channel: process.env.TELEGRAM_CHANNEL_URL || 'https://t.me/dinidu20030304',
    mini: process.env.MINI_APP_URL || process.env.TELEGRAM_BOT_URL || 'https://t.me/CINE_UNIVERSE_OFFCIALS_BOT'
  };
}

async function sendPhoto(token, chatId, caption, keyboard){
  const candidates=[
    path.join(process.cwd(),'public','cine-universe-logo.jpg'),
    path.join(process.cwd(),'cine-universe-logo.jpg')
  ];
  let photo;
  for(const file of candidates){
    try{ photo=await fs.readFile(file); break; }catch{}
  }
  if(!photo) throw new Error('Cine Universe logo not found.');

  const form=new FormData();
  form.append('chat_id',String(chatId));
  form.append('photo',new Blob([photo],{type:'image/jpeg'}),'cine-universe-logo.jpg');
  form.append('caption',caption);
  form.append('parse_mode','HTML');
  form.append('reply_markup',JSON.stringify(keyboard));

  const response=await fetch(`https://api.telegram.org/bot${token}/sendPhoto`,{
    method:'POST',
    body:form
  });
  const data=await response.json();
  if(!response.ok || !data.ok) throw new Error(data?.description || `Telegram HTTP ${response.status}`);
  return data;
}

async function sendText(token,chatId,text,keyboard){
  const response=await fetch(`https://api.telegram.org/bot${token}/sendMessage`,{
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({
      chat_id:chatId,
      text,
      parse_mode:'HTML',
      reply_markup:keyboard
    })
  });
  const data=await response.json();
  if(!response.ok || !data.ok) throw new Error(data?.description || `Telegram HTTP ${response.status}`);
  return data;
}

function botCaption(user){
  const display=String(user?.first_name||user?.username||'මිතුරා').trim();
  const mention=`<a href="tg://user?id=${Number(user?.id||0)}">${htmlEscape(display)}</a>`;
  return [
    '╔════════════════════════════╗',
    '🎬 <b>CINE UNIVERSE</b> ✦',
    '╚════════════════════════════╝',
    '',
    `👋 <b>ආයුබෝවන් ${mention}!</b> ❤️`,
    '',
    '🌌 <b>YOUR CINEMATIC UNIVERSE</b>',
    '🍿 Movies, TV Series &amp; Sinhala Subtitles',
    '',
    '✨ <b>WHAT YOU CAN DO</b>',
    '🎬 Movies',
    '📺 TV Series',
    '🇱🇰 Sinhala Subtitles',
    '🔎 Smart Search',
    '📥 Available Downloads',
    '',
    '🔍 <b>SEARCH</b>',
    '<code>Avatar 2009</code>',
    '<code>The Last of Us 2025</code>',
    '',
    '🎬 <b>COLLECTION</b>',
    '<code>Fast and Furious</code>',
    '',
    '⚡ <b>Search → Select → Download → Enjoy</b> 🍿',
    '',
    '📢 <b>STAY UPDATED</b>',
    'Latest Movie &amp; TV updates සඳහා Official Channel එක Follow කරන්න. 🔥',
    '',
    '🌌 <i>Your story starts here.</i>',
    '',
    '© 2026 <b>Dinidu Induwara</b> • Cine Universe'
  ].join('\n');
}

function groupCaption(members){
  const mentions=members.map(user=>{
    const display=String(user?.first_name||user?.username||'අලුත් සාමාජිකයා').trim();
    return `<a href="tg://user?id=${Number(user?.id||0)}">${htmlEscape(display)}</a>`;
  }).join(', ');
  return [
    '╔════════════════════════════╗',
    '🎬 <b>CINE UNIVERSE</b> ✦',
    '╚════════════════════════════╝',
    '',
    `👋 <b>ආයුබෝවන් ${mentions}!</b> ❤️`,
    '',
    '🌌 <b>WELCOME TO THE CINEMATIC UNIVERSE</b>',
    '🍿 Movies • TV Series • Sinhala Subtitles',
    '',
    '✨ <b>QUICK GUIDE</b>',
    '🔎 Search: <code>Avatar 2009</code>',
    '🎬 Collection: <code>Avatar</code>',
    '📥 Downloads: Cine Universe Bot',
    '',
    '📢 Latest updates සඳහා Official Channel එක Follow කරන්න. 🔥',
    '',
    '🤝 <b>Enjoy the group &amp; respect the community.</b>',
    '',
    '© 2026 <b>Dinidu Induwara</b> • Cine Universe'
  ].join('\n');
}

export async function handleCineUniverseWelcome(message){
  const token=String(process.env.TELEGRAM_BOT_TOKEN||'').trim();
  if(!token) return {handled:false};

  const chatType=String(message?.chat?.type||'');
  const groupId=String(process.env.MOVIE_REQUEST_GROUP_CHAT_ID||'').trim();
  const {bot,channel,mini}=urls();

  if(chatType==='private'){
    const text=String(message?.text||'').trim();
    if(!/^\/start(?:@\w+)?(?:\s+.*)?$/i.test(text)) return {handled:false};

    const caption=botCaption(message.from);
    const keyboard={inline_keyboard:[
      [{text:'🎬 OPEN CINE UNIVERSE',url:mini}],
      [{text:'📢 OFFICIAL UPDATES',url:channel}]
    ]};

    try{
      await sendPhoto(token,message.chat.id,caption,keyboard);
      return {handled:true,welcome:true,bot:true};
    }catch(err){
      console.warn('[cine-welcome] bot photo failed; text fallback:',err.message||err);
      try{
        await sendText(token,message.chat.id,caption,keyboard);
        return {handled:true,welcome:true,bot:true,fallback:true};
      }catch(fallbackErr){
        console.error('[cine-welcome] bot welcome failed:',fallbackErr.message||fallbackErr);
        return {handled:true,welcome:true,bot:true,error:true};
      }
    }
  }

  const members=Array.isArray(message?.new_chat_members)?message.new_chat_members:[];
  if(!members.length || !['group','supergroup'].includes(chatType)) return {handled:false};
  if(groupId && String(message?.chat?.id)!==groupId) return {handled:false};

  const caption=groupCaption(members);
  const keyboard={inline_keyboard:[
    [{text:'🤖 OPEN CINE UNIVERSE BOT',url:bot}],
    [{text:'📢 OFFICIAL UPDATES',url:channel}]
  ]};

  try{
    await sendPhoto(token,message.chat.id,caption,keyboard);
    return {handled:true,welcome:true,count:members.length};
  }catch(err){
    console.warn('[cine-welcome] group photo failed; text fallback:',err.message||err);
    try{
      await sendText(token,message.chat.id,caption,keyboard);
      return {handled:true,welcome:true,count:members.length,fallback:true};
    }catch(fallbackErr){
      console.error('[cine-welcome] group welcome failed:',fallbackErr.message||fallbackErr);
      return {handled:true,welcome:true,count:members.length,error:true};
    }
  }
}
