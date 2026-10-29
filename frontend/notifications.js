/* Octo Buddy in-browser notification polling. Uses the signed-in user's API token. */
(() => {
  const API=(window.OCTOBUDDY_API_BASE_URL||"https://studybuddy-bl8d.onrender.com/api/").replace(/\/?$/, "/");
  let seen=new Set(); let first=true;
  async function poll(){
    const token=localStorage.getItem("auth_token"); if(!token)return;
    try{
      const response=await fetch(`${API}notifications`,{headers:{Authorization:`Bearer ${token}`}});
      if(!response.ok)return;
      const data=await response.json(); const items=data.notifications||[];
      if(first){items.forEach(n=>seen.add(n.id));first=false;return;}
      for(const n of items){if(seen.has(n.id))continue;seen.add(n.id);
        if("Notification" in window){
          if(Notification.permission==="granted")new Notification(n.title,{body:n.message,tag:`octobuddy-${n.id}`});
          else if(Notification.permission==="default")Notification.requestPermission().catch(()=>{});
        }
        let tray=document.getElementById("octoNotificationToast");
        if(!tray){tray=document.createElement("div");tray.id="octoNotificationToast";tray.style.cssText="position:fixed;right:20px;bottom:20px;z-index:99999;max-width:360px;background:#fff;border:1px solid #dce8eb;border-left:5px solid #12b8a6;border-radius:12px;padding:16px;box-shadow:0 12px 32px #102f421f;color:#183b5c";document.body.appendChild(tray);}
        tray.innerHTML=`<strong>${String(n.title).replace(/[&<>]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[c]))}</strong><p>${String(n.message).replace(/[&<>]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[c]))}</p>`;
        fetch(`${API}notifications/${n.id}/read`,{method:"PUT",headers:{Authorization:`Bearer ${token}`}}).catch(()=>{});
        setTimeout(()=>{if(tray&&tray.isConnected)tray.remove();},7000);
      }
    }catch(e){console.debug("Octo Buddy notifications are temporarily unavailable.");}
  }
  document.addEventListener("DOMContentLoaded",()=>{poll();setInterval(poll,20000);});
})();
