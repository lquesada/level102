# level102

Small browser minigames, made with AI as personal projects. They work on PC, phone and tablet, in English, Spanish
and German.

Play them at **https://level102.com**.

## Games

- **Drink Mixer** -- https://level102.com/drinkmixer/
- **Infinite Dungeon** -- https://level102.com/infinitedungeon/
- **Candy Shop** -- https://level102.com/candyshop/
- **Fluid** -- https://level102.com/fluid/
- **Arcade Claw** -- https://level102.com/arcadeclaw/

## Repository

- `docs/` -- the website, published with GitHub Pages (`docs/index.html` is the home page; each game is
  `docs/<game>/index.html`, one self-contained HTML file)
- `templates/topbar.html` -- the shared top bar (back link, language EN/ES/DE, text size) pasted into every game
- `tests/<game>/` -- headless-Chrome tests for each game; `tests/home/` checks the home page; `tests/lib/` is the shared browser helper
- `run_tests.sh` -- runs all tests (`./run_tests.sh drinkmixer` for one game). Needs Node >= 22 and Chrome/Chromium.

## Author

Luis Quesada -- https://luisquesada.com

## License

Copyright (C) 2026 Luis Quesada

This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public
License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later
version. See [LICENSE](LICENSE).
