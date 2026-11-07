# Song Explainer for MyGo Music

A listening companion that explains the song playing, a lyric line, its origins, genres, creators, musical design and the stories behind it. Answers stream into Now Playing and can include researched source links.

Requires **MyGo Music 0.1.22 or later**, with the Explain pane and explanation plugin API.

## Install

[Install Song Explainer](mygo-music://install-plugin?repo=runes780/mygo-music-song-explainer)

Or open **Settings → Plugins → + → From GitHub…** and enter:

```text
runes780/mygo-music-song-explainer
```

For a development build of MyGo Music, use the [development install link](mygo-music-dev://install-plugin?repo=runes780/mygo-music-song-explainer).

## Set up

The plugin uses **DeepSeek Flash** by default:

- **API Key:** your DeepSeek API key.
- **Base URL:** leave empty for `https://api.deepseek.com`.
- **Model:** leave empty for `deepseek-flash`.
- **Web Research:** on by default; set to `off` to skip DeepSeek Search API requests and their charges.

To use another OpenAI-compatible provider, change the Base URL, Model and API Key. Local providers that accept the same API may not need a key.

## Use

Open Now Playing and choose **Explain**. For a specific line, right-click it and choose **Explain This Lyric**. Select **Ask a follow-up** when you want to ask something else about the song.

## Privacy and permissions

Track metadata, selected lyrics and questions are sent to the configured provider. DeepSeek web research also sends a search query to DeepSeek's Search API. The plugin requests broad network access because the provider's Base URL is configurable. API keys are stored by MyGo Music's plugin settings.

## Develop

There is nothing to build. Edit `index.js`, `plugin.json` or `locales/zh-CN.json`, then install the folder with **Settings → Plugins → + → From a Folder…**. The extension uses the host's JavaScript runtime, `fetch`, settings and storage APIs; no npm dependencies are needed.

## License

AGPL-3.0. See [LICENSE](LICENSE).
