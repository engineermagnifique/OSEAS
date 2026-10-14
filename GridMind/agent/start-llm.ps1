# Starts the open-source model server (llama.cpp) that GridMind talks to.
#
#   .\start-llm.ps1
#   .\start-llm.ps1 -Model D:\llama.cpp\models\qwen2.5-3b-instruct-q4_k_m.gguf
#
# Get llama.cpp (llama-*-bin-win-cpu-x64.zip) from
# https://github.com/ggml-org/llama.cpp/releases and the model from
# https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF (qwen2.5-1.5b-instruct-q4_k_m.gguf).
# On a faster machine the 3B model (Qwen2.5-3B-Instruct-GGUF) gives better answers.

param(
	[string]$LlamaDir = "D:\llama.cpp",
	[string]$Model = "D:\llama.cpp\models\qwen2.5-1.5b-instruct-q4_k_m.gguf",
	[int]$Port = 8081,
	[int]$Context = 8192
)

$server = Join-Path $LlamaDir "bin\llama-server.exe"
if (-not (Test-Path $server)) { Write-Error "llama-server.exe not found at $server"; exit 1 }
if (-not (Test-Path $Model)) { Write-Error "Model not found at $Model"; exit 1 }

$alias = [IO.Path]::GetFileNameWithoutExtension($Model)

# One slot so the long, fixed system prompt stays cached between questions.
& $server -m $Model --host 127.0.0.1 --port $Port -c $Context -np 1 --jinja --alias $alias
