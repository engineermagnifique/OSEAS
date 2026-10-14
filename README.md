# OSEAS

## GridMind: the AI assistant in the EAE map

GridMind is an open-source AI chat assistant inside the Energy Access Explorer map, built for the AskEAE hackathon challenge. You ask in plain language ("Where should we build solar mini-grids?"), and it sets up the priority map, names the best areas with real numbers, and explains what the map's colours mean. It runs on an open-source model (Qwen2.5-1.5B with llama.cpp) on a normal laptop, with no paid API key.

To run it, open three PowerShell windows, in this order:

| Window | Command | Port |
| --- | --- | --- |
| 1. AI model | `cd D:\OSEAS\GridMind\agent; .\start-llm.ps1` | 8081 |
| 2. GridMind agent | `cd D:\OSEAS\GridMind\agent; node server.js` | 8787 |
| 3. Website and map | `cd D:\eae-preview\dist; python -m http.server 8080` | 8080 |

Then open http://localhost:8080/tool/a/?id=562ffd81-d326-41e4-9ba0-2dedb21130b2 (Kenya) and click **GridMind** at the bottom right. Window 3 needs the site built first (the steps below), plus the map tool: `cd D:\eae-preview; node build-tool.js D:\OSEAS\eae-tool D:\eae-preview\dist\tool`. Building the website deletes `dist`, so build the map tool after it.

[GridMind/agent/README.md](GridMind/agent/README.md) has the full guide: how the AI works, accuracy results, troubleshooting, demo questions and how to present it to judges.

## Running the website locally

These steps build the Energy Access Explorer website (`eae-website`) and show it at http://localhost:8080/ on Windows. They use Node.js and Python instead of Go and make.

### Before you start

Install these once, then open **PowerShell**:

- [Node.js](https://nodejs.org/) (any current LTS version)
- [Python 3](https://www.python.org/downloads/)

The commands assume the project is at `D:\OSEAS`. If yours is somewhere else, change that path in Steps 4 and 5.

### Step 1: Create a working folder

```powershell
mkdir D:\eae-preview
cd D:\eae-preview
```

### Step 2: Install the template library

```powershell
npm init -y
npm install mustache@4.2.0
```

### Step 3: Create the build script

Paste this whole block at once. It creates `build.js`, which turns the templates into HTML pages.

```powershell
@'
const fs=require('fs'),path=require('path'),M=require('mustache');
const src=process.argv[2], out=process.argv[3], T=path.join(src,'templates');
const partials=new Proxy({},{get:(_,n)=>{const f=path.join(T,n+'.mustache');return fs.existsSync(f)?fs.readFileSync(f,'utf8'):''}});
const layout=fs.readFileSync(path.join(T,'layout.mustache'),'utf8');
fs.rmSync(out,{recursive:true,force:true});
fs.cpSync(path.join(src,'assets'),out,{recursive:true});
for(const r of fs.readFileSync(path.join(src,'routes.tsv'),'utf8').split(/\r?\n/).filter(Boolean)){
  const v=r.replace(/\//g,'')||'index';
  const content=M.render(fs.readFileSync(path.join(T,v+'.mustache'),'utf8'),{},partials);
  const html=M.render(layout,{content},partials);
  fs.mkdirSync(path.join(out,r),{recursive:true});
  fs.writeFileSync(path.join(out,r,'index.html'),html); console.log('->',r);
}
'@ | Out-File -Encoding utf8 build.js
```

### Step 4: Build the pages

```powershell
node build.js D:\OSEAS\eae-website D:\eae-preview\dist
```

You should see 13 lines such as `-> /` and `-> /about`.

### Step 5: Download the fonts and scripts

```powershell
mkdir D:\eae-preview\dist\lib\fonts -Force
Get-Content D:\OSEAS\eae-website\dependencies.tsv | ForEach-Object {
  $parts = $_.Trim() -split "`t"
  if ($parts.Count -eq 2) {
    Invoke-WebRequest -Uri $parts[1] -OutFile "D:\eae-preview\dist\lib\$($parts[0])"
    Write-Host "ok $($parts[0])"
  }
}
```

You should see 7 `ok` lines.

### Step 6: Start the web server

```powershell
cd D:\eae-preview\dist
python -m http.server 8080
```

Keep this window open. Press **Ctrl+C** to stop the server.

### Step 7: Open the site

In your browser, go to http://localhost:8080/

### After editing a template

The site does not update by itself. Stop the server with **Ctrl+C**, then:

1. Rebuild the pages:

   ```powershell
   cd D:\eae-preview
   node build.js D:\OSEAS\eae-website D:\eae-preview\dist
   ```

2. Run Step 5 again, because rebuilding deletes the downloaded fonts and scripts.
3. Start the server again with Step 6 and refresh the browser.

### Known limits

- The **Tool** link in the menu does not work. The tool is a separate app (`eae-tool`).
- **Login** and **password reset** need online services, so they may not work locally.
- If port 8080 is busy, use another one, such as `python -m http.server 8081`, and open http://localhost:8081/
