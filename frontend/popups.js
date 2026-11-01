(() => {
  if (window.__octoPopupReady) return;
  window.__octoPopupReady = true;
  const style = document.createElement("style");
  style.textContent = `
    .octo-popup-backdrop{position:fixed;inset:0;background:rgba(12,24,43,.58);backdrop-filter:blur(5px);display:flex;align-items:center;justify-content:center;padding:20px;z-index:10000;opacity:0;animation:octoFadeIn .16s ease forwards}
    .octo-popup{width:min(100%,420px);background:#fff;border:1px solid rgba(25,48,76,.08);border-radius:18px;box-shadow:0 24px 70px rgba(7,20,40,.24);padding:25px;color:#1c2b40;font-family:inherit;transform:translateY(8px);animation:octoRise .18s ease forwards}
    .octo-popup-mark{width:42px;height:42px;border-radius:13px;background:#e9f8f3;color:#16866b;display:grid;place-items:center;font-size:21px;margin-bottom:15px}
    .octo-popup h3{font-size:19px;line-height:1.3;margin:0 0 9px;color:#182b43;font-weight:700}
    .octo-popup p{font-size:14px;line-height:1.6;color:#607087;margin:0;white-space:pre-line}
    .octo-popup input{width:100%;box-sizing:border-box;margin-top:17px;border:1px solid #d8e0e9;border-radius:10px;padding:12px 13px;font:inherit;color:#1c2b40;outline:none}
    .octo-popup input:focus{border-color:#259b83;box-shadow:0 0 0 3px rgba(37,155,131,.12)}
    .octo-popup-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:23px}
    .octo-popup-actions button{border:0;border-radius:10px;padding:10px 17px;font-family:inherit;font-size:13px;font-weight:600;cursor:pointer;transition:filter .15s,transform .15s}
    .octo-popup-actions button:hover{filter:brightness(.96);transform:translateY(-1px)}
    .octo-popup-cancel{background:#edf1f5;color:#43536a}.octo-popup-ok{background:#16866b;color:#fff}
    @keyframes octoFadeIn{to{opacity:1}}@keyframes octoRise{to{transform:translateY(0)}}
    @media(max-width:480px){.octo-popup{padding:21px;border-radius:15px}}
  `;
  document.head.appendChild(style);
  function show({title="Octo Buddy", message="", mode="alert", value=""}={}) {
    return new Promise(resolve => {
      const backdrop=document.createElement("div");backdrop.className="octo-popup-backdrop";
      const panel=document.createElement("section");panel.className="octo-popup";panel.setAttribute("role","dialog");panel.setAttribute("aria-modal","true");
      const mark=document.createElement("div");mark.className="octo-popup-mark";mark.textContent=mode==="confirm"?"?":mode==="prompt"?"✎":"✓";
      const heading=document.createElement("h3");heading.textContent=title;
      const body=document.createElement("p");body.textContent=String(message);
      panel.append(mark,heading,body);
      let field=null;
      if(mode==="prompt"){field=document.createElement("input");field.type="text";field.value=value;panel.appendChild(field);}
      const actions=document.createElement("div");actions.className="octo-popup-actions";
      const cancel=document.createElement("button");cancel.className="octo-popup-cancel";cancel.type="button";cancel.textContent=mode==="alert"?"Close":"Cancel";
      const ok=document.createElement("button");ok.className="octo-popup-ok";ok.type="button";ok.textContent=mode==="confirm"?"Continue":mode==="prompt"?"Save":"Got it";
      actions.append(cancel);if(mode!=="alert")actions.append(ok);panel.appendChild(actions);backdrop.appendChild(panel);document.body.appendChild(backdrop);
      const finish=result=>{backdrop.remove();resolve(result);};
      cancel.addEventListener("click",()=>finish(mode==="prompt"?null:false));
      ok.addEventListener("click",()=>finish(mode==="prompt"?field.value:mode==="confirm"?true:undefined));
      backdrop.addEventListener("click",e=>{if(e.target===backdrop)finish(mode==="prompt"?null:false);});
      panel.addEventListener("keydown",e=>{if(e.key==="Escape")finish(mode==="prompt"?null:false);if(e.key==="Enter"&&mode!=="alert")finish(mode==="prompt"?field.value:true);});
      (field||ok).focus();
    });
  }
  window.octoAlert=(message,title="Octo Buddy")=>show({message,title,mode:"alert"});
  window.octoConfirm=(message,title="Please confirm")=>show({message,title,mode:"confirm"});
  window.octoPrompt=(message,value="",title="Enter details")=>show({message,title,mode:"prompt",value});
  window.alert=(message)=>{window.octoAlert(message);};
})();