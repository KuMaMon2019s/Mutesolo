var H=Object.defineProperty;var N=(i,e,t)=>e in i?H(i,e,{enumerable:!0,configurable:!0,writable:!0,value:t}):i[e]=t;var p=(i,e,t)=>N(i,typeof e!="symbol"?e+"":e,t);(function(){const e=document.createElement("link").relList;if(e&&e.supports&&e.supports("modulepreload"))return;for(const r of document.querySelectorAll('link[rel="modulepreload"]'))n(r);new MutationObserver(r=>{for(const s of r)if(s.type==="childList")for(const o of s.addedNodes)o.tagName==="LINK"&&o.rel==="modulepreload"&&n(o)}).observe(document,{childList:!0,subtree:!0});function t(r){const s={};return r.integrity&&(s.integrity=r.integrity),r.referrerPolicy&&(s.referrerPolicy=r.referrerPolicy),r.crossOrigin==="use-credentials"?s.credentials="include":r.crossOrigin==="anonymous"?s.credentials="omit":s.credentials="same-origin",s}function n(r){if(r.ep)return;r.ep=!0;const s=t(r);fetch(r.href,s)}})();try{}catch(i){console.error("[wxt] Failed to initialize plugins",i)}class O{constructor(e,t){p(this,"routes",{});p(this,"currentPage",null);p(this,"container");this.container=e;for(const[n,r]of Object.entries(t))this.routes[n]={component:r,page:null}}start(){console.log("[Router] start() called, current hash:",window.location.hash),window.addEventListener("hashchange",()=>this.navigate()),window.location.hash?(console.log("[Router] hash present, navigating"),this.navigate()):(console.log("[Router] no hash, setting #login"),window.location.hash="#login")}navigate(){var c;const e=window.location.hash.replace("#","")||"login",[t,n]=e.split("?"),r=t;console.log("[Router] navigate() to:",r,"params:",n);const s={};if(n)for(const u of n.split("&")){const[m,h]=u.split("=");m&&(s[decodeURIComponent(m)]=decodeURIComponent(h??""))}const o=this.routes[r];if(!o){window.location.hash="#login";return}(c=this.currentPage)!=null&&c.destroy&&this.currentPage.destroy(),this.container.innerHTML="",this.container.dataset.route=r,this.container.dataset.params=JSON.stringify(s),o.page||(o.page=new o.component),o.page.render(this.container),this.currentPage=o.page,console.log("[Router] page rendered:",r)}}class R{constructor(){p(this,"container",null);p(this,"submitting",!1)}async render(e){if(console.log("[LoginPage] render() called"),this.container=e,(await chrome.storage.local.get(["mutesolo_token"])).mutesolo_token){window.location.hash="#workload";return}const n=await chrome.storage.local.get(["mutesolo_remember_username","mutesolo_remember_password"]),r=n.mutesolo_remember_username??"",s=n.mutesolo_remember_password??"",o=!!(r&&s);e.innerHTML=`
      <!-- Background -->
      <div class="absolute inset-0 z-0">
        <img src="/background.jpeg" alt="" class="w-full h-full object-cover opacity-30" />
        <div class="absolute inset-0 bg-black/60 backdrop-blur-sm"></div>
      </div>

      <!-- Content -->
      <div class="relative z-10 flex flex-col items-center justify-center h-full px-6">
        <!-- Logo / Title -->
        <div class="mb-8 text-center">
          <h1 class="text-2xl font-bold tracking-tight text-text-primary">Mutesolo</h1>
          <p class="text-muted text-sm mt-1">Agent Task Manager</p>
        </div>

        <!-- Login Form -->
        <form id="login-form" class="w-full max-w-xs space-y-4">
          <div>
            <label class="block text-xs text-muted mb-1" for="username">Username</label>
            <input
              id="username"
              type="text"
              autocomplete="username"
              class="w-full px-3 py-2 bg-card/80 border border-line-soft rounded-md text-text-primary text-sm placeholder-faint focus:outline-none focus:border-blue transition-colors"
              placeholder="Enter username"
              value="${this.escapeAttr(r)}"
              required
            />
          </div>
          <div>
            <label class="block text-xs text-muted mb-1" for="password">Password</label>
            <input
              id="password"
              type="password"
              autocomplete="current-password"
              class="w-full px-3 py-2 bg-card/80 border border-line-soft rounded-md text-text-primary text-sm placeholder-faint focus:outline-none focus:border-blue transition-colors"
              placeholder="Enter password"
              value="${this.escapeAttr(s)}"
              required
            />
          </div>

          <!-- Remember me -->
          <label class="flex items-center gap-2 text-xs text-muted cursor-pointer select-none">
            <input id="remember-checkbox" type="checkbox" class="accent-blue w-3.5 h-3.5" ${o?"checked":""} />
            <span>Remember me</span>
          </label>

          <div id="login-error" class="text-red-400 text-xs hidden"></div>
          <button
            id="login-btn"
            type="submit"
            class="w-full py-2 bg-blue text-white rounded-md text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            Login
          </button>
        </form>

        <p class="text-faint text-xs mt-6">Login only — no registration</p>
      </div>
    `,this.bindEvents()}bindEvents(){this.container.querySelector("#login-form").addEventListener("submit",t=>this.handleLogin(t))}async handleLogin(e){if(e.preventDefault(),this.submitting)return;const t=this.container.querySelector("#username").value.trim(),n=this.container.querySelector("#password").value,r=this.container.querySelector("#remember-checkbox").checked,s=this.container.querySelector("#login-error"),o=this.container.querySelector("#login-btn");if(!t||!n){s.textContent="Please enter username and password",s.classList.remove("hidden");return}this.submitting=!0,o.disabled=!0,o.textContent="Logging in...",s.classList.add("hidden");try{const c=await fetch("http://localhost:8787/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username:t,password:n})});if(!c.ok)throw c.status===401||c.status===403?new Error("Invalid credentials"):new Error(`Server error (${c.status})`);const u=await c.json();if(console.log("[LoginPage] login response:",u),!u||typeof u!="object"||typeof u.token!="string")throw console.error("[LoginPage] unexpected response shape:",u),new Error("Invalid server response");const{token:m,user:h}=u;if(typeof(h==null?void 0:h.username)!="string")throw console.error("[LoginPage] unexpected user shape:",h),new Error("Invalid server response");const l={mutesolo_token:m,mutesolo_user:h.username};r?(l.mutesolo_remember_username=t,l.mutesolo_remember_password=n):await chrome.storage.local.remove(["mutesolo_remember_username","mutesolo_remember_password"]),await chrome.storage.local.set(l),console.log("[LoginPage] login success, redirecting to #workload"),window.location.hash="#workload"}catch(c){c instanceof TypeError?s.textContent="Cannot connect to server":c instanceof Error?s.textContent=c.message:s.textContent="Login failed",s.classList.remove("hidden")}finally{this.submitting=!1,o.disabled=!1,o.textContent="Login"}}escapeAttr(e){return e.replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}destroy(){this.container=null}}const U="http://localhost:8787";async function D(){return(await chrome.storage.local.get(["mutesolo_token"])).mutesolo_token??null}async function w(i,e={}){const t=await D();if(!t)return new Response(JSON.stringify({error:"No auth token"}),{status:401,headers:{"Content-Type":"application/json"}});const n={"Content-Type":"application/json",...e.headers};n.Authorization=`Bearer ${t}`;const r=`${U}${i}`;return fetch(r,{...e,headers:n})}async function _(i,e){const t=await w(i,{method:"PUT",body:JSON.stringify(e)});if(!t.ok)throw new Error(`API error ${t.status}: ${t.statusText}`);return t.json()}async function C(){return(await chrome.storage.local.get(["mutesolo_token"])).mutesolo_token?!0:(window.location.hash="#login",!1)}const P={success:"bg-green-500/10 text-green-400 border-green-500/20",error:"bg-red-500/10 text-red-400 border-red-500/20",info:"bg-gray-500/10 text-gray-400 border-gray-500/20"};let v=null;function G(){return v||(v=document.createElement("div"),v.id="global-toast-container",v.className="fixed bottom-4 right-4 z-50 flex flex-col gap-2",document.body.appendChild(v)),v}function A(i,e="info",t=3e3){const n=G(),r=P[e]??P.info,s=document.createElement("div");s.className=`px-4 py-2 rounded-lg border text-xs font-medium ${r} shadow-lg animate-in`,s.textContent=i,s.style.cssText+="animation: slideIn 0.3s ease;",n.appendChild(s),setTimeout(()=>{s.style.opacity="0",s.style.transition="opacity 0.3s ease",setTimeout(()=>s.remove(),300)},t)}class B{constructor(){p(this,"_workloads",[]);p(this,"_selectedAgent",null);p(this,"_user",null);p(this,"_loading",!1);p(this,"_error",null);p(this,"listeners",new Set)}get workloads(){return this._workloads}get selectedAgent(){return this._selectedAgent}get user(){return this._user}get loading(){return this._loading}get error(){return this._error}get agents(){return this._workloads.filter(e=>typeof e.agent=="string"&&e.agent.length>0).map(e=>e.agent)}subscribe(e){return this.listeners.add(e),()=>{this.listeners.delete(e)}}notify(){this.listeners.forEach(e=>e())}setSelectedAgent(e){this._selectedAgent=e,this.notify()}async loadUser(){if(this._user===null){try{const t=(await chrome.storage.local.get(["mutesolo_user"])).mutesolo_user;t&&typeof t=="object"&&"username"in t?(this._user=t.username,await chrome.storage.local.set({mutesolo_user:this._user})):typeof t=="string"?this._user=t:this._user=null}catch{this._user=null}this.notify()}}async loadWorkloads(e=!1){if(!(!e&&(this._loading||this._workloads.length>0))){this._loading=!0,this._error=null,this.notify();try{const t=await w("/api/agent-workload");if(t.status===401){window.location.hash="#login";return}if(!t.ok)throw new Error(`Workloads API error ${t.status}`);const n=await t.json();if(console.log("[store] /api/agent-workload raw response:",n),!Array.isArray(n))throw console.error("[store] workloads response is not an array:",typeof n),new Error("Invalid workloads response: expected array");const r=[],s=[];for(const o of n)o&&typeof o.agent=="string"?r.push(o):s.push(o);s.length>0&&console.warn("[store] filtered out",s.length,"workload entries with non-string agent:",s),this._workloads=r,console.log("[store] workloads loaded:",r.length,"agents"),this._error=null}catch(t){this._error=t instanceof TypeError?"Cannot connect to server":t.message}finally{this._loading=!1,this.notify()}}}getWorkload(e){if(typeof e=="string")return this._workloads.find(t=>t.agent===e)}async handleLogout(){try{await chrome.storage.local.remove(["mutesolo_token","mutesolo_user"])}catch{}this._user=null,this._workloads=[],this._selectedAgent=null,this._error=null,this.notify(),window.location.hash="#login"}}const d=new B,W={draft:"Backlog",sent:"To Do",in_progress:"In Progress",closed:"Done"},z={draft:"#ff8b66",sent:"#8b95a5",in_progress:"#5b8def",closed:"#4dc89a"},T=["#5b8def","#e05b8d","#5be0a3","#e0c85b","#8d5be0","#e08d5b","#5bc0de","#de8d5b","#a35be0","#e05ba3","#5be0c8","#c8e05b"];function F(i){const e=typeof i=="string"&&i.length>0?i:String(i??"?");let t=0;for(let n=0;n<e.length;n++)t=t*31+e.charCodeAt(n)|0;return T[Math.abs(t)%T.length]}function $(i){return((typeof i=="string"&&i.length>0?i:String(i??"")).slice(0,1)||"?").toUpperCase()}function J(i){return((typeof i=="string"&&i.length>0?i:String(i??"")).slice(0,2)||"??").toUpperCase()}function Q(i,e){const t=e>0?Math.round(i/e*100):0,n=Math.round(t/100*20);let r="";for(let s=0;s<20;s++){const o=s<n?"#4dc89a":"#3a3f4b";r+=`<span style="display:inline-block;width:8px;height:8px;background:${o};border-radius:1px;"></span>`}return`<div class="flex items-center gap-2">
    <div class="flex gap-[2px]">${r}</div>
    <span class="text-xs text-muted whitespace-nowrap font-medium">${t}%</span>
  </div>`}class K{constructor(){p(this,"container",null);p(this,"tasks",[]);p(this,"searchQuery","");p(this,"loadingTasks",!1);p(this,"profileOpen",!1);p(this,"unsub",null);p(this,"lastLoadedAgent",null)}async render(e){this.container=e,await C()&&(this.unsub=d.subscribe(()=>this.onStoreChange()),await d.loadUser(),await d.loadWorkloads(),this.renderShell(),this.renderSidebar(),this.bindShellEvents(),!d.selectedAgent&&d.agents.length>0&&d.setSelectedAgent(d.agents[0]),d.selectedAgent&&await this.selectAgent(d.selectedAgent))}onStoreChange(){this.container&&(this.renderSidebar(),d.selectedAgent&&d.selectedAgent!==this.lastLoadedAgent&&this.selectAgent(d.selectedAgent))}renderShell(){const e=this.container;e.innerHTML=`
      <!-- Main: side-by-side layout -->
      <div class="flex flex-1 overflow-hidden min-h-0">
        <!-- Left: Agent sidebar -->
        <aside id="agent-sidebar" class="w-[72px] shrink-0 border-r border-line-soft flex flex-col items-center pt-5 pb-3 gap-3 overflow-y-auto">
          <div id="agent-loading" class="text-faint text-xs mt-2">Loading...</div>
        </aside>

        <!-- Right: main content area (or profile panel) -->
        <div id="right-panel" class="flex-1 flex flex-col overflow-hidden min-w-0">
          <!-- Header -->
          <header class="flex items-center justify-between px-3 py-2 border-b border-line-soft shrink-0">
            <h1 class="text-sm font-bold text-text-primary">Mutesolo</h1>
          </header>

          <!-- Search bar -->
          <div class="flex gap-2 px-3 py-2 border-b border-line-soft shrink-0">
            <input
              id="task-search"
              type="text"
              placeholder="Search tasks..."
              class="flex-1 px-3 py-2 bg-card border border-line-soft rounded text-xs text-text-primary placeholder-faint focus:outline-none focus:border-blue transition-colors"
            />
            <button id="search-btn" class="px-3 py-2 rounded text-xs font-medium text-white hover:opacity-90 transition-opacity" style="background:#2c6bed">
              Search
            </button>
          </div>

          <!-- Progress bar area (between search and task cards) -->
          <div id="progress-area" class="px-3 py-1.5 border-b border-line-soft shrink-0 flex items-center justify-between">
            <span class="text-[11px] text-muted">Select an agent</span>
          </div>

          <!-- Task card list -->
          <div class="flex-1 overflow-y-auto p-3">
            <div id="task-area" class="text-center text-muted text-xs mt-8">
              Select an agent to view tasks
            </div>
          </div>
        </div>
      </div>
    `,this.bindShellEvents()}renderSidebar(){var l;const e=(l=this.container)==null?void 0:l.querySelector("#agent-sidebar");if(!e)return;const t=d.agents,n=d.selectedAgent;console.log("[WorkloadPage] renderSidebar — agents:",t.length,"selected:",n),e.innerHTML="";const r=document.createElement("div");r.className="flex flex-col items-center shrink-0 mb-1",r.innerHTML=`
      <img src="/icon128.png" alt="Mutesolo" class="w-[52px] h-[52px] rounded-full object-cover shrink-0" />
    `,e.appendChild(r);const s=document.createElement("div");if(s.className="w-10 border-t border-line-soft shrink-0",e.appendChild(s),d.loading){const a=document.createElement("div");a.id="agent-loading",a.className="text-faint text-xs mt-2",a.textContent="Loading...",e.appendChild(a)}else if(d.error){const a=document.createElement("div");a.className="text-red-400 text-[10px] text-center px-1 mt-2",a.textContent=d.error,e.appendChild(a)}else if(t.length===0){const a=document.createElement("div");a.className="text-faint text-xs mt-2 text-center px-1",a.textContent="No agents",e.appendChild(a)}else for(const a of t){const g=d.getWorkload(a),f=(g==null?void 0:g.done)??0,y=g?g.backlog+g.todo+g.in_progress+g.done:0,k=F(a),x=n===a,b=document.createElement("div");b.className="flex flex-col items-center gap-1 cursor-pointer shrink-0 group relative",b.title=a,b.innerHTML=`
          <div class="relative w-[52px] h-[52px] flex-shrink-0">
            <div class="w-[52px] h-[52px] rounded-full flex items-center justify-center text-white font-bold transition-transform group-hover:scale-110"
                 style="background: ${k}; font-size: 20px; ${x?"box-shadow: 0 0 0 3px #5b8def;":""}">
              ${J(a)}
            </div>
          </div>
          <span class="text-[13px] text-muted leading-none max-w-[62px] truncate text-center">${this.escapeHtml(a)}</span>
          <span class="text-[12px] text-faint leading-none">${f}/${y}</span>
        `,b.addEventListener("click",()=>this.selectAgent(a)),e.appendChild(b)}const o=document.createElement("div");o.className="w-10 border-t border-line-soft mt-auto",e.appendChild(o);const c=document.createElement("div");c.id="profile-area",c.className="flex flex-col items-center gap-0.5 shrink-0 relative";const u=d.user??"U",m=$(u);c.innerHTML=`
      <button id="profile-btn" class="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white transition-transform hover:scale-110 cursor-pointer border-0"
              style="background: linear-gradient(135deg, #4f8ef7, #7c3aed);" title="${this.escapeHtml(u)}">
        ${m}
      </button>
    `,e.appendChild(c);const h=c.querySelector("#profile-btn");h==null||h.addEventListener("click",a=>{a.stopPropagation(),this.openProfilePanel()})}openProfilePanel(){var r,s,o;const e=(r=this.container)==null?void 0:r.querySelector("#right-panel");if(!e)return;this.profileOpen=!0;const t=d.user??"U",n=$(t);e.innerHTML=`
      <!-- Profile Header -->
      <header class="flex items-center gap-2 px-3 py-2 border-b border-line-soft shrink-0">
        <button id="profile-back-btn" class="text-muted hover:text-text-primary transition-colors text-lg leading-none cursor-pointer border-0 bg-transparent">&larr;</button>
        <h1 class="text-sm font-bold text-text-primary">Profile</h1>
      </header>

      <!-- Profile Content -->
      <div class="flex-1 overflow-y-auto flex flex-col items-center pt-8 px-4">
        <!-- Avatar -->
        <div class="w-20 h-20 rounded-full flex items-center justify-center text-white font-bold mb-4"
             style="background: linear-gradient(135deg, #4f8ef7, #7c3aed); font-size: 32px;">
          ${n}
        </div>

        <!-- Username -->
        <h2 class="text-lg font-semibold text-text-primary mb-1">${this.escapeHtml(t)}</h2>
        <p class="text-xs text-muted mb-6">Mutesolo Extension User</p>

        <!-- Stats -->
        <div class="w-full max-w-xs bg-card border border-line-soft rounded-lg p-4 mb-4">
          <h3 class="text-xs font-semibold text-muted uppercase tracking-wider mb-3">Account Info</h3>
          <div class="space-y-2">
            <div class="flex items-center justify-between">
              <span class="text-xs text-muted">Account</span>
              <span class="text-xs text-text-primary">${this.escapeHtml(t)}</span>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-xs text-muted">API Endpoint</span>
              <span class="text-xs text-text-primary">localhost:8787</span>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-xs text-muted">Version</span>
              <span class="text-xs text-text-primary">v0.1.0</span>
            </div>
          </div>
        </div>

        <!-- Logout -->
        <button id="profile-logout-btn" class="w-full max-w-xs px-4 py-2.5 bg-red-500/10 text-red-400 border border-red-500/20 rounded-lg text-sm font-medium hover:bg-red-500/20 transition-colors cursor-pointer">
          Logout
        </button>
      </div>
    `,(s=e.querySelector("#profile-back-btn"))==null||s.addEventListener("click",()=>{this.closeProfilePanel()}),(o=e.querySelector("#profile-logout-btn"))==null||o.addEventListener("click",()=>{confirm("Are you sure you want to logout?")&&d.handleLogout()})}closeProfilePanel(){this.profileOpen=!1,this.renderShell(),this.renderSidebar(),d.selectedAgent&&this.selectAgent(d.selectedAgent)}bindShellEvents(){const e=this.container,t=e.querySelector("#task-search"),n=e.querySelector("#search-btn"),r=()=>{this.searchQuery=t.value.trim().toLowerCase(),this.renderTaskCards()};n.addEventListener("click",r),t.addEventListener("keydown",s=>{s.key==="Enter"&&r()}),t.addEventListener("input",()=>{this.searchQuery=t.value.trim().toLowerCase(),this.renderTaskCards()})}async selectAgent(e){if(this.loadingTasks)return;d.setSelectedAgent(e),this.updateProgressBar(e);const t=this.container.querySelector("#task-area");t.innerHTML='<div class="flex items-center justify-center mt-8"><div class="animate-spin w-5 h-5 border-2 border-blue border-t-transparent rounded-full"></div></div>',this.loadingTasks=!0;try{const n=await w(`/api/agent-tasks?member=${encodeURIComponent(e)}`);if(n.status===401){window.location.hash="#login";return}if(!n.ok)throw new Error(`Tasks API error ${n.status}`);const r=await n.json();this.tasks=r.tasks??[],this.searchQuery="";const s=this.container.querySelector("#task-search");s&&(s.value=""),this.lastLoadedAgent=e,this.renderTaskCards()}catch(n){const r=this.container.querySelector("#task-area");n instanceof TypeError?r.innerHTML='<div class="text-red-400 text-xs text-center mt-8">Cannot connect to server</div>':r.innerHTML=`<div class="text-red-400 text-xs text-center mt-8">${n.message}</div>`}finally{this.loadingTasks=!1}}updateProgressBar(e){var o;const t=(o=this.container)==null?void 0:o.querySelector("#progress-area");if(!t)return;const n=d.getWorkload(e),r=(n==null?void 0:n.done)??0,s=n?n.backlog+n.todo+n.in_progress+n.done:0;t.innerHTML=`
      <span class="text-[11px] text-muted">${this.escapeHtml(e)}</span>
      ${Q(r,s)}
    `}renderTaskCards(){const e=this.container.querySelector("#task-area");if(!d.selectedAgent){e.innerHTML='<div class="text-center text-muted text-xs mt-8">Select an agent to view tasks</div>';return}if(this.tasks.length===0){e.innerHTML='<div class="text-center text-muted text-xs mt-8">No tasks found</div>';return}let n=this.tasks;if(this.searchQuery){const r=this.searchQuery;n=n.filter(s=>s.title.toLowerCase().includes(r)||(s.branch_name??"").toLowerCase().includes(r)||(s.project_name??"").toLowerCase().includes(r))}if(n.length===0){e.innerHTML=`<div class="text-center text-muted text-xs mt-8">No tasks match "${this.escapeHtml(this.searchQuery)}"</div>`;return}e.innerHTML=`<div class="flex flex-col gap-3">${n.map(r=>this.taskCard(r)).join("")}</div>`,e.querySelectorAll("[data-task-card]").forEach(r=>{r.addEventListener("click",()=>{const s=r.dataset.projectId,o=r.dataset.requirementId;window.location.hash=`#detail?project_id=${encodeURIComponent(s)}&requirement_id=${encodeURIComponent(o)}`})})}taskCard(e){const t=z[e.status]??"#555f70",n=W[e.status]??e.status,r=e.priority||"no_priority";let s="#555f70",o="None";return r==="P0"||r==="high"?(s="#dc3545",o="High"):r==="P1"||r==="medium"?(s="#ff8b66",o="Medium"):r==="P2"||r==="low"?(s="#5b8def",o="Low"):(s="#555f70",o="None"),`
      <div
        class="break-inside-avoid bg-card border border-line-soft rounded-lg p-3 mb-3 cursor-pointer hover:border-blue transition-colors"
        data-task-card
        data-project-id="${this.escapeAttr(e.project_id)}"
        data-requirement-id="${this.escapeAttr(e.requirement_id)}"
      >
        <div class="flex items-center gap-2 mb-1.5">
          <span class="w-2 h-2 rounded-full shrink-0" style="background:${t}"></span>
          <span class="text-xs text-muted">${this.escapeHtml(n)}</span>
          <span class="ml-auto px-1.5 py-0.5 rounded text-[10px] font-medium"
                style="background: ${s}20; color: ${s}; border: 1px solid ${s}40;">
            ${this.escapeHtml(o)}
          </span>
        </div>
        <div class="text-sm font-semibold text-text-primary text-left mb-2">
          ${this.escapeHtml(e.title)}
        </div>
      </div>`}escapeHtml(e){const t=typeof e=="string"?e:String(e??""),n=document.createElement("div");return n.textContent=t,n.innerHTML}escapeAttr(e){return e.replace(/"/g,"&quot;").replace(/'/g,"&#39;")}destroy(){var e;this.container=null,(e=this.unsub)==null||e.call(this),this.unsub=null}}const V=["No priority","Low","Medium","High","Urgent"],I=["#5b8def","#e05b8d","#5be0a3","#e0c85b","#8d5be0","#e08d5b","#5bc0de","#de8d5b","#a35be0","#e05ba3","#5be0c8","#c8e05b"];function Y(i){const e=typeof i=="string"&&i.length>0?i:String(i??"?");let t=0;for(let n=0;n<e.length;n++)t=t*31+e.charCodeAt(n)|0;return I[Math.abs(t)%I.length]}function q(i){return((typeof i=="string"&&i.length>0?i:String(i??"")).slice(0,2)||"??").toUpperCase()}function X(i,e){const t=e>0?Math.round(i/e*100):0,n=22,r=2*Math.PI*n,s=r-t/100*r;return`<svg class="absolute inset-0 -rotate-90" width="52" height="52" viewBox="0 0 52 52">
    <circle cx="26" cy="26" r="${n}" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="3"/>
    <circle cx="26" cy="26" r="${n}" fill="none" stroke="#4dc89a" stroke-width="3"
            stroke-dasharray="${r}" stroke-dashoffset="${s}" stroke-linecap="round"/>
  </svg>`}class Z{constructor(){p(this,"container",null);p(this,"projectId","");p(this,"requirementId","");p(this,"requirement",null);p(this,"promptResult","");p(this,"saving",!1);p(this,"generating",!1);p(this,"profileOpen",!1);p(this,"unsub",null)}async render(e){if(this.container=e,!await C())return;this.unsub=d.subscribe(()=>this.renderSidebar()),await d.loadUser(),await d.loadWorkloads();const t=this.getParams();if(this.projectId=t.project_id??"",this.requirementId=t.requirement_id??"",!this.projectId||!this.requirementId){this.renderError("Missing project or requirement ID.");return}this.renderShell(),this.loadData()}renderError(e){const t=this.container;t.innerHTML=`
      <header class="flex items-center gap-2 px-3 py-2 border-b border-line-soft shrink-0">
        <a href="#workload" class="text-muted hover:text-text-primary transition-colors text-lg leading-none">&larr;</a>
        <h1 class="text-sm font-bold text-text-primary">Task detail</h1>
      </header>
      <div class="flex-1 flex items-center justify-center">
        <p class="text-muted text-xs">${this.escapeHtml(e)}</p>
      </div>`}renderShell(){const e=this.container;e.innerHTML=`
      <!-- Main: side-by-side layout -->
      <div class="flex flex-1 overflow-hidden min-h-0">
        <!-- Left: Agent sidebar + profile -->
        <aside id="detail-agent-sidebar" class="w-[72px] shrink-0 border-r border-line-soft flex flex-col items-center pt-5 pb-3 gap-3 overflow-y-auto">
        </aside>

        <!-- Right: detail content -->
        <div id="right-panel" class="flex-1 flex flex-col overflow-hidden min-w-0">
          <!-- Header -->
          <header class="flex items-center gap-3 px-3 py-2 border-b border-line-soft shrink-0">
            <a href="#workload" class="text-muted hover:text-text-primary transition-colors text-lg leading-none">&larr;</a>
            <div class="flex flex-col min-w-0">
              <h1 class="text-sm font-bold text-text-primary">Task detail</h1>
              <p class="text-[11px] text-faint truncate">Edit requirement and generate AI agent prompt.</p>
            </div>
          </header>

          <!-- Tabs -->
          <nav id="detail-tabs" class="flex border-b border-line-soft shrink-0">
            <button class="detail-tab px-4 py-2 text-xs font-medium text-blue border-b-2 border-blue bg-transparent" data-tab="requirement">
              Requirement
            </button>
            <button class="detail-tab px-4 py-2 text-xs font-medium text-muted border-b-2 border-transparent hover:text-text-primary transition-colors" data-tab="prompt">
              Prompt
            </button>
          </nav>

          <!-- Tab content -->
          <div class="flex-1 overflow-y-auto p-3">
            <!-- Requirement Tab -->
            <div id="tab-requirement" class="detail-tab-content space-y-4">
              <div>
                <label class="block text-xs text-muted mb-1">Title</label>
                <input
                  id="detail-title"
                  type="text"
                  class="w-full px-3 py-2 bg-card border border-line-soft rounded-md text-text-primary text-sm placeholder-faint focus:outline-none focus:border-blue transition-colors"
                  placeholder="Task title"
                />
              </div>

              <div>
                <label class="block text-xs text-muted mb-1">Description</label>
                <div id="detail-description-editor" contenteditable="true" 
                     class="w-full min-h-[200px] p-3 bg-card border border-line-soft rounded-md text-text-primary text-sm focus:outline-none focus:border-blue transition-colors overflow-y-auto"
                     style="min-height: 200px; max-height: 400px;">
                </div>
              </div>

              <div>
                <label class="block text-xs text-muted mb-2">Priority</label>
                <div id="detail-priority" class="flex gap-3 flex-wrap">
                  ${V.map((t,n)=>`
                    <label class="flex items-center gap-1.5 text-xs text-muted cursor-pointer">
                      <input type="radio" name="priority" value="${this.escapeAttr(t)}" ${n===0?"checked":""} class="accent-blue" />
                      ${this.escapeHtml(t)}
                    </label>
                  `).join("")}
                </div>
              </div>

              <div>
                <label class="block text-xs text-muted mb-1">Assignee</label>
                <select
                  id="detail-assignee"
                  class="w-full px-3 py-2 bg-card border border-line-soft rounded-md text-text-primary text-sm focus:outline-none focus:border-blue transition-colors"
                >
                  <option value="">Loading agents...</option>
                </select>
              </div>

              <div class="flex gap-2">
                <button id="detail-general-btn" class="px-4 py-1.5 bg-blue text-white rounded text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-50">
                  General
                </button>
                <button id="detail-save-btn" class="px-4 py-1.5 bg-blue text-white rounded text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-50">
                  Save
                </button>
                <span id="detail-save-toast" class="text-xs text-green-400 self-center hidden">Saved</span>
              </div>

              <!-- Loading bar below General/Save -->
              <div id="detail-general-status" class="text-muted text-xs mt-2 hidden">
                <div class="flex items-center gap-2 mb-1">
                  <span class="inline-flex items-center gap-2">
                    <span class="animate-spin w-3 h-3 border-2 border-blue border-t-transparent rounded-full"></span>
                    <span class="text-xs text-muted">Generating prompt...</span>
                  </span>
                </div>
                <div class="w-full h-1 bg-line-soft rounded-full overflow-hidden">
                  <div id="detail-general-progress" class="h-full bg-blue rounded-full transition-all duration-300" style="width: 0%"></div>
                </div>
              </div>

              <div id="detail-req-error" class="text-red-400 text-xs hidden"></div>
            </div>

            <!-- Prompt Tab -->
            <div id="tab-prompt" class="detail-tab-content hidden space-y-4">
              <button
                id="detail-generate-btn"
                class="px-4 py-1.5 bg-blue text-white rounded text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                Generate
              </button>

              <div id="detail-generate-status" class="text-muted text-xs hidden">
                <span class="inline-flex items-center gap-2">
                  <span class="animate-spin w-3 h-3 border-2 border-blue border-t-transparent rounded-full"></span>
                  Generating prompt...
                </span>
              </div>

              <div id="detail-prompt-result" class="hidden space-y-3">
                <div class="flex items-center justify-between">
                  <span class="text-xs text-muted font-medium">Generated Prompt</span>
                  <button id="detail-copy-btn" class="px-3 py-1 bg-card border border-line-soft text-muted rounded text-xs hover:border-blue hover:text-text-primary transition-colors">
                    Copy
                  </button>
                </div>
                <div id="detail-prompt-content" class="bg-[#0d1117] border border-line-soft rounded-lg p-4 font-mono text-xs text-muted whitespace-pre-wrap leading-relaxed max-h-[400px] overflow-y-auto">
                </div>
              </div>

              <div id="detail-prompt-error" class="text-red-400 text-xs hidden"></div>
            </div>
          </div>
        </div>
      </div>
    `,this.renderSidebar(),this.bindEvents()}renderSidebar(){var h;const e=(h=this.container)==null?void 0:h.querySelector("#detail-agent-sidebar");if(!e)return;const t=d.agents;e.innerHTML="";const n=document.createElement("div");n.className="flex flex-col items-center shrink-0 mb-1",n.innerHTML=`
      <img src="/icon128.png" alt="Mutesolo" class="w-[52px] h-[52px] rounded-full object-cover shrink-0" />
    `,e.appendChild(n);const r=document.createElement("div");if(r.className="w-10 border-t border-line-soft mb-1",e.appendChild(r),d.loading){const l=document.createElement("div");l.className="text-faint text-xs mt-2",l.textContent="Loading...",e.appendChild(l);return}if(t.length===0){const l=document.createElement("div");l.className="text-faint text-xs mt-2 text-center px-1",l.textContent="No agents",e.appendChild(l)}else for(const l of t){const a=d.getWorkload(l),g=(a==null?void 0:a.done)??0,f=a?a.backlog+a.todo+a.in_progress+a.done:0,y=Y(l),k=d.selectedAgent===l,x=document.createElement("div");x.className="flex flex-col items-center gap-1 cursor-pointer shrink-0 group relative",x.title=l;const b=X(g,f);x.innerHTML=`
          <div class="relative w-[52px] h-[52px] flex-shrink-0">
            ${b}
            <div class="absolute inset-0 w-[52px] h-[52px] rounded-full flex items-center justify-center text-white font-bold transition-transform group-hover:scale-110"
                 style="background: ${y}; font-size: 20px; ${k?"box-shadow: 0 0 0 3px #5b8def;":""}">
              ${q(l)}
            </div>
          </div>
          <span class="text-[13px] text-muted leading-none max-w-[62px] truncate text-center">${this.escapeHtml(l)}</span>
          <span class="text-[12px] text-faint leading-none">${g}/${f}</span>
        `,x.addEventListener("click",S=>{S.stopPropagation(),d.setSelectedAgent(l),window.location.hash="#workload"}),e.appendChild(x)}const s=document.createElement("div");s.className="w-10 border-t border-line-soft mt-auto",e.appendChild(s);const o=document.createElement("div");o.id="profile-area",o.className="flex flex-col items-center gap-0.5 shrink-0 relative";const c=d.user??"U",u=q(c);o.innerHTML=`
      <button id="profile-btn" class="w-9 h-9 rounded-full flex items-center justify-center text-[13px] font-bold text-white transition-transform hover:scale-110 cursor-pointer border-0"
              style="background: linear-gradient(135deg, #4f8ef7, #7c3aed);" title="${this.escapeHtml(c)}">
        ${u}
      </button>
    `,e.appendChild(o);const m=o.querySelector("#profile-btn");m==null||m.addEventListener("click",l=>{l.stopPropagation(),this.openProfilePanel()})}openProfilePanel(){var r,s,o;const e=(r=this.container)==null?void 0:r.querySelector("#right-panel");if(!e)return;this.profileOpen=!0;const t=d.user??"U",n=q(t);e.innerHTML=`
      <header class="flex items-center gap-3 px-3 py-2 border-b border-line-soft shrink-0">
        <button id="profile-back-btn" class="text-muted hover:text-text-primary transition-colors text-lg leading-none cursor-pointer border-0 bg-transparent">&larr;</button>
        <h1 class="text-sm font-bold text-text-primary">Profile</h1>
      </header>
      <div class="flex-1 overflow-y-auto flex flex-col items-center pt-8 px-4">
        <div class="w-20 h-20 rounded-full flex items-center justify-center text-white font-bold mb-4"
             style="background: linear-gradient(135deg, #4f8ef7, #7c3aed); font-size: 32px;">
          ${n}
        </div>
        <h2 class="text-lg font-semibold text-text-primary mb-1">${this.escapeHtml(t)}</h2>
        <p class="text-xs text-muted mb-6">Mutesolo Extension User</p>
        <div class="w-full max-w-xs bg-card border border-line-soft rounded-lg p-4 mb-4">
          <h3 class="text-xs font-semibold text-muted uppercase tracking-wider mb-3">Account Info</h3>
          <div class="space-y-2">
            <div class="flex items-center justify-between">
              <span class="text-xs text-muted">Account</span>
              <span class="text-xs text-text-primary">${this.escapeHtml(t)}</span>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-xs text-muted">API Endpoint</span>
              <span class="text-xs text-text-primary">localhost:8787</span>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-xs text-muted">Version</span>
              <span class="text-xs text-text-primary">v0.1.0</span>
            </div>
          </div>
        </div>
        <button id="profile-logout-btn" class="w-full max-w-xs px-4 py-2.5 bg-red-500/10 text-red-400 border border-red-500/20 rounded-lg text-sm font-medium hover:bg-red-500/20 transition-colors cursor-pointer">
          Logout
        </button>
      </div>
    `,(s=e.querySelector("#profile-back-btn"))==null||s.addEventListener("click",()=>{this.closeProfilePanel()}),(o=e.querySelector("#profile-logout-btn"))==null||o.addEventListener("click",()=>{confirm("Are you sure you want to logout?")&&d.handleLogout()})}closeProfilePanel(){this.profileOpen=!1,this.renderShell(),this.loadData()}bindEvents(){var t,n,r,s;const e=this.container;e.addEventListener("click",o=>{const c=o.target.closest(".detail-tab");if(!c)return;const u=c.dataset.tab,m=e.querySelectorAll(".detail-tab"),h=e.querySelectorAll(".detail-tab-content");m.forEach(l=>{l.classList.remove("text-blue","border-blue"),l.classList.add("text-muted","border-transparent")}),c.classList.add("text-blue","border-blue"),c.classList.remove("text-muted","border-transparent"),h.forEach(l=>{l.id===`tab-${u}`?l.classList.remove("hidden"):l.classList.add("hidden")})}),(t=e.querySelector("#detail-save-btn"))==null||t.addEventListener("click",o=>{o.stopPropagation(),this.handleSave()}),(n=e.querySelector("#detail-general-btn"))==null||n.addEventListener("click",o=>{o.stopPropagation(),this.handleGenerateFromGeneral(o)}),(r=e.querySelector("#detail-generate-btn"))==null||r.addEventListener("click",()=>this.handleGenerate()),(s=e.querySelector("#detail-copy-btn"))==null||s.addEventListener("click",()=>this.handleCopy())}async loadData(){try{const e=await w(`/api/requirement?project_id=${encodeURIComponent(this.projectId)}&requirement_id=${encodeURIComponent(this.requirementId)}`);if(e.status===401){window.location.hash="#login";return}if(!e.ok)throw new Error(`Requirement API error ${e.status}`);this.requirement=await e.json(),this.populateForm(),this.populateAssignee()}catch(e){this.showReqError(e instanceof TypeError?"Cannot connect to server":e.message)}}populateForm(){const e=this.requirement;if(!e)return;const t=this.container.querySelector("#detail-title");t&&(t.value=e.title??"");const n=this.container.querySelector("#detail-description-editor");if(n)if(e.description)n.innerHTML=e.description.replace(/src="\/assets\//g,'src="http://localhost:8787/assets/');else{const o=this.extractPlainTextFromEditorContent(e.editor_content);o&&(n.textContent=o)}const r=e.priority??"No priority",s=this.container.querySelector(`input[name="priority"][value="${this.escapeAttr(r)}"]`);s&&(s.checked=!0)}extractPlainTextFromEditorContent(e){if(!e)return"";try{const t=Array.isArray(e)?e:[e],n=[],r=s=>{if(s!=null){if(typeof s=="string"){const o=s.trim();o&&n.push(o);return}if(typeof s=="object"){const o=s;typeof o.text=="string"&&o.text.trim()&&n.push(o.text.trim());for(const c of Object.values(o))r(c)}if(Array.isArray(s))for(const o of s)r(o)}};return r(t),n.join(`
`)}catch{return""}}populateAssignee(){var n;const e=this.container.querySelector("#detail-assignee");if(!e)return;const t=d.agents;e.innerHTML='<option value="">Unassigned</option>'+t.map(r=>`<option value="${this.escapeAttr(r)}">${this.escapeHtml(r)}</option>`).join(""),(n=this.requirement)!=null&&n.assigned_member&&(e.value=this.requirement.assigned_member)}async handleGenerateFromGeneral(e){var u,m,h;if(e&&(e.stopPropagation(),e.preventDefault()),this.generating)return;this.generating=!0;const t=this.container.querySelector("#detail-general-btn"),n=this.container.querySelector("#detail-general-status"),r=this.container.querySelector("#detail-general-progress"),s=this.container.querySelector("#detail-req-error");t.disabled=!0,n.classList.remove("hidden"),s.classList.add("hidden");let o=0;const c=setInterval(()=>{o=Math.min(o+12,85),r&&(r.style.width=`${o}%`)},250);try{const l=this.container.querySelector("#detail-description-editor"),a=((u=l==null?void 0:l.innerHTML)==null?void 0:u.trim())||((h=(m=this.requirement)==null?void 0:m.description)==null?void 0:h.trim())||"";if(console.log("[DetailPage] General: plainText length:",a.length),!a)throw new Error("Description is empty. Please enter a description and click Save first.");const g=this.container.querySelector("#detail-title").value.trim(),f=this.container.querySelector('input[name="priority"]:checked'),y=(f==null?void 0:f.value)??"No priority",k=this.container.querySelector("#detail-assignee").value;if(g)try{console.log("[DetailPage] General: saving before generate..."),await _(`/api/projects/${encodeURIComponent(this.projectId)}/requirements/${encodeURIComponent(this.requirementId)}`,{title:g,description:a,priority:y==="No priority"?"":y,assigned_member:k}),this.requirement&&(this.requirement.description=a),console.log("[DetailPage] General: save OK")}catch(E){console.log("[DetailPage] General: save failed (continuing):",E)}console.log("[DetailPage] General: calling generate-prompt API...");const x=await w("/api/generate-prompt",{method:"POST",body:JSON.stringify({projectId:this.projectId,requirementId:this.requirementId,plainText:a,blocks:[],tencentDocs:[],attachments:[]})});if(x.status===401){const M=(await chrome.storage.local.get(["mutesolo_token"])).mutesolo_token?"Session expired. Please logout and login again.":"Not logged in. Please go back and login.";throw new Error(M)}if(!x.ok)throw new Error(`Generate API error ${x.status}`);const b=await x.json();console.log("[DetailPage] General: generate response keys:",Object.keys(b));const S=b.prompt??b.result??b.content??"";if(!S)throw new Error("No prompt content returned");this.promptResult=S,this.renderPromptContent(S);const L=this.container.querySelector("#detail-prompt-result");L==null||L.classList.remove("hidden"),this.switchTab("prompt"),console.log("[DetailPage] General: done, switched to prompt tab")}catch(l){const a=l instanceof TypeError?"Cannot connect to server":l.message;console.error("[DetailPage] General: error:",a),s.textContent=a,s.classList.remove("hidden")}finally{clearInterval(c),r&&(r.style.width="100%"),setTimeout(()=>{this.generating=!1,t.disabled=!1,n.classList.add("hidden"),r&&(r.style.width="0%")},500)}}switchTab(e){const t=this.container.querySelectorAll(".detail-tab"),n=this.container.querySelectorAll(".detail-tab-content");t.forEach(r=>{r.dataset.tab===e?(r.classList.add("text-blue","border-blue"),r.classList.remove("text-muted","border-transparent")):(r.classList.remove("text-blue","border-blue"),r.classList.add("text-muted","border-transparent"))}),n.forEach(r=>{r.id===`tab-${e}`?r.classList.remove("hidden"):r.classList.add("hidden")})}async handleSave(){var h,l,a;if(this.saving)return;this.saving=!0;const e=this.container.querySelector("#detail-save-btn"),t=this.container.querySelector("#detail-save-toast"),n=this.container.querySelector("#detail-req-error");e.disabled=!0,n.classList.add("hidden"),t.classList.add("hidden");const r=this.container.querySelector("#detail-title").value.trim(),s=this.container.querySelector('input[name="priority"]:checked'),o=(s==null?void 0:s.value)??"No priority",c=this.container.querySelector("#detail-assignee").value,u=this.container.querySelector("#detail-description-editor"),m=((h=u==null?void 0:u.innerHTML)==null?void 0:h.trim())||((a=(l=this.requirement)==null?void 0:l.description)==null?void 0:a.trim())||"";if(console.log("[DetailPage] Save: title=",r,"description length=",m.length),!r){n.textContent="Title is required",n.classList.remove("hidden"),this.saving=!1,e.disabled=!1;return}try{console.log("[DetailPage] Save: calling PUT API..."),await _(`/api/projects/${encodeURIComponent(this.projectId)}/requirements/${encodeURIComponent(this.requirementId)}`,{title:r,description:m,priority:o==="No priority"?"":o,assigned_member:c}),console.log("[DetailPage] Save: PUT OK"),this.requirement&&(this.requirement.title=r,this.requirement.description=m,this.requirement.priority=o==="No priority"?"":o,this.requirement.assigned_member=c),t.classList.remove("hidden"),setTimeout(()=>t.classList.add("hidden"),2500)}catch(g){const f=g instanceof TypeError?"Cannot connect to server":g.message;console.error("[DetailPage] Save: error:",f),n.textContent=f,n.classList.remove("hidden")}finally{this.saving=!1,e.disabled=!1}}async handleGenerate(){var s,o,c;if(this.generating)return;this.generating=!0;const e=this.container.querySelector("#detail-generate-btn"),t=this.container.querySelector("#detail-generate-status"),n=this.container.querySelector("#detail-prompt-result"),r=this.container.querySelector("#detail-prompt-error");e.disabled=!0,t.classList.remove("hidden"),n.classList.add("hidden"),r.classList.add("hidden");try{const u=this.container.querySelector("#detail-description-editor"),m=((s=u==null?void 0:u.innerHTML)==null?void 0:s.trim())||((c=(o=this.requirement)==null?void 0:o.description)==null?void 0:c.trim())||"",h=await w("/api/generate-prompt",{method:"POST",body:JSON.stringify({projectId:this.projectId,requirementId:this.requirementId,plainText:m,blocks:[],tencentDocs:[],attachments:[]})});if(h.status===401){const f=(await chrome.storage.local.get(["mutesolo_token"])).mutesolo_token?"Session expired. Please logout and login again.":"Not logged in. Please go back and login.";throw new Error(f)}if(!h.ok)throw new Error(`Generate API error ${h.status}`);const l=await h.json(),a=l.prompt??l.result??l.content??"";if(!a)throw new Error("No prompt content returned");this.promptResult=a,this.renderPromptContent(a),n.classList.remove("hidden")}catch(u){r.textContent=u instanceof TypeError?"Cannot connect to server":u.message,r.classList.remove("hidden")}finally{this.generating=!1,e.disabled=!1,t.classList.add("hidden")}}renderPromptContent(e){const t=this.container.querySelector("#detail-prompt-content");if(!t)return;const n=[];let r=e.replace(/```(\w*)\n([\s\S]*?)```/g,(o,c,u)=>{const m=n.length;return n.push(`<pre class="bg-[#161b22] border border-line-soft rounded my-2 p-3 overflow-x-auto"><code class="text-xs text-[#c9d1d9]">${this.escapeHtml(u.trim())}</code></pre>`),`__CODEBLOCK_${m}__`}),s=this.escapeHtml(r);s=s.replace(/^### (.+)$/gm,'<h4 class="text-xs font-semibold text-[#e6edf3] mt-3 mb-1">$1</h4>'),s=s.replace(/^## (.+)$/gm,'<h3 class="text-sm font-semibold text-[#e6edf3] mt-4 mb-2">$1</h3>'),s=s.replace(/^# (.+)$/gm,'<h2 class="text-base font-semibold text-[#e6edf3] mt-4 mb-2">$1</h2>'),s=s.replace(/\*\*(.+?)\*\*/g,'<strong class="text-[#e6edf3]">$1</strong>'),s=s.replace(/`([^`]+)`/g,'<code class="bg-[#161b22] text-[#c9d1d9] px-1 py-0.5 rounded text-[11px]">$1</code>'),s=s.replace(/^- (.+)$/gm,'<li class="text-xs text-muted ml-4 list-disc">$1</li>'),s=s.replace(/\n\n/g,"<br/><br/>"),s=s.replace(/__CODEBLOCK_(\d+)__/g,(o,c)=>n[parseInt(c)]??""),t.innerHTML=s}async handleCopy(){try{await navigator.clipboard.writeText(this.promptResult);const e=this.container.querySelector("#detail-copy-btn"),t=e.textContent;e.textContent="Copied!",e.classList.add("text-green-400","border-green-400"),setTimeout(()=>{e.textContent=t,e.classList.remove("text-green-400","border-green-400")},2e3)}catch{const e=document.createElement("textarea");e.value=this.promptResult,e.style.position="fixed",e.style.opacity="0",document.body.appendChild(e),e.select(),document.execCommand("copy"),document.body.removeChild(e)}}showReqError(e){var n;const t=(n=this.container)==null?void 0:n.querySelector("#detail-req-error");t&&(t.textContent=e,t.classList.remove("hidden"))}getParams(){var e;try{return JSON.parse(((e=this.container)==null?void 0:e.dataset.params)??"{}")}catch{return{}}}escapeHtml(e){const t=typeof e=="string"?e:String(e??""),n=document.createElement("div");return n.textContent=t,n.innerHTML}escapeAttr(e){return(typeof e=="string"?e:String(e??"")).replace(/"/g,"&quot;").replace(/'/g,"&#39;")}destroy(){var e;this.container=null,this.requirement=null,this.promptResult="",(e=this.unsub)==null||e.call(this),this.unsub=null}}class ee{constructor(){p(this,"container",null)}async render(e){this.container=e,await C()&&(this.renderShell(),this.loadUser())}renderShell(){const e=this.container;e.innerHTML=`
      <!-- Header -->
      <header class="flex items-center gap-2 px-3 py-2 border-b border-line-soft shrink-0">
        <a href="#workload" class="text-muted hover:text-text-primary transition-colors text-lg leading-none">&larr;</a>
        <h1 class="text-sm font-bold text-text-primary">Settings</h1>
      </header>

      <!-- Settings content -->
      <div class="flex-1 overflow-y-auto p-4 space-y-5">
        <section>
          <h2 class="text-xs font-semibold text-muted uppercase tracking-wider mb-3">Account</h2>
          <div class="bg-card border border-line-soft rounded-lg p-4">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-3 min-w-0">
                <div id="settings-user-avatar" class="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0" style="background: #5b8def;">
                  ?
                </div>
                <span class="text-sm text-text-primary truncate" id="settings-user">Loading...</span>
              </div>
              <button id="logout-btn" class="px-3 py-1.5 bg-red-500/10 text-red-400 border border-red-500/20 rounded-md text-xs font-medium hover:bg-red-500/20 transition-colors shrink-0 ml-3">
                Logout
              </button>
            </div>
          </div>
        </section>

        <section>
          <h2 class="text-xs font-semibold text-muted uppercase tracking-wider mb-3">Backend</h2>
          <div class="bg-card border border-line-soft rounded-lg p-3">
            <p class="text-xs text-muted">API endpoint: <code class="text-blue bg-line-soft px-1 rounded">http://localhost:8787</code></p>
          </div>
        </section>

        <section>
          <h2 class="text-xs font-semibold text-muted uppercase tracking-wider mb-3">About</h2>
          <div class="bg-card border border-line-soft rounded-lg p-3">
            <p class="text-xs text-muted">Mutesolo Extension v0.1.0</p>
            <p class="text-xs text-faint mt-1">Agent Task Manager — Chrome Side Panel</p>
          </div>
        </section>
      </div>
    `,this.bindEvents()}async loadUser(){var e,t,n;try{const s=(await chrome.storage.local.get(["mutesolo_user"])).mutesolo_user,o=(e=this.container)==null?void 0:e.querySelector("#settings-user"),c=(t=this.container)==null?void 0:t.querySelector("#settings-user-avatar");o&&s?(o.textContent=s,c&&(c.textContent=(s[0]??"?").toUpperCase(),c.style.background=this.avatarColor(s))):o&&(o.textContent="Not logged in",o.classList.add("text-muted"))}catch{const r=(n=this.container)==null?void 0:n.querySelector("#settings-user");r&&(r.textContent="Error loading user",r.classList.add("text-red-400"))}}bindEvents(){var t;(t=this.container.querySelector("#logout-btn"))==null||t.addEventListener("click",()=>{confirm("Are you sure you want to logout?")&&this.handleLogout()})}async handleLogout(){try{await chrome.storage.local.remove(["mutesolo_token","mutesolo_user"]),A("Logged out successfully","success"),setTimeout(()=>{window.location.hash="#login"},500)}catch{A("Logout failed","error")}}avatarColor(e){const t=typeof e=="string"&&e.length>0?e:String(e??"?"),n=["#5b8def","#e05b8d","#5be0a3","#e0c85b","#8d5be0","#e08d5b","#5bc0de","#de8d5b","#a35be0","#e05ba3","#5be0c8","#c8e05b"];let r=0;for(let s=0;s<t.length;s++)r=r*31+t.charCodeAt(s)|0;return n[Math.abs(r)%n.length]}destroy(){this.container=null}}console.log("[Mutesolo] sidepanel bootstrap starting...");const j=document.getElementById("app");if(!j)throw console.error("[Mutesolo] #app element not found!"),new Error("App container #app not found");console.log("[Mutesolo] #app element found, initializing router...");d.loadUser();d.loadWorkloads();const te=new O(j,{login:R,workload:K,detail:Z,settings:ee});console.log("[Mutesolo] router created, starting...");te.start();console.log("[Mutesolo] router started, hash:",window.location.hash);
