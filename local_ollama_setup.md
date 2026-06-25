# Local Ollama Discord Bot Setup

## 1. Install Ollama

Download and install Ollama:

https://ollama.com/download

After installation, Ollama usually runs in the background on Windows.

## 2. Download a local model

Recommended balanced model:

```powershell
ollama pull qwen2.5:3b
```

If your PC is weak, use a lighter model:

```powershell
ollama pull qwen2.5:1.5b
```

If your PC is strong and you want better quality:

```powershell
ollama pull qwen3:8b
```

## 3. Set `.env`

Use this for local mode:

```env
DISCORD_TOKEN=your_discord_bot_token
AI_BACKEND=ollama
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=qwen2.5:3b
OLLAMA_DEEP_MODEL=qwen2.5:3b
MAX_HISTORY_MESSAGES=4
MAX_OUTPUT_TOKENS=180
MAX_DEEP_OUTPUT_TOKENS=320
DISCORD_LOG_LEVEL=WARNING
APP_LOG_LEVEL=WARNING
```

For higher quality on stronger PCs:

```env
OLLAMA_MODEL=qwen2.5:3b
OLLAMA_DEEP_MODEL=qwen3:8b
```

## 4. Run locally

Install the needed Python packages:

```powershell
pip install discord.py python-dotenv
```

Then run:

```powershell
python improved_discord_gemini_bot.py
```

## Important Railway note

If the bot runs on Railway, `127.0.0.1` means the Railway container, not your PC.

For true local AI, run the Discord bot on the same PC where Ollama is installed.
