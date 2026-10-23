# Glow Vendas (PWA + APK)

App de gestão de vendas, estoque e lucro de cosméticos.

- `www/` → o app (HTML, CSS e JS). Também funciona como PWA no Netlify.
- `.github/workflows/build-apk.yml` → gera o APK automaticamente no GitHub.

## Como gerar o APK
1. Envie todos os arquivos deste projeto para um repositório no GitHub (branch `main`).
2. Abra a aba **Actions** do repositório. O workflow **Gerar APK** roda sozinho (leva uns 5 a 8 minutos).
3. Quando ficar verde, clique na execução e baixe **glow-vendas-apk** em *Artifacts*.
4. Extraia o zip, passe o `app-debug.apk` para o celular e instale (permita "fontes desconhecidas").

Para gerar de novo sem mudar nada: Actions → Gerar APK → **Run workflow**.

## Atualizar o app
Edite os arquivos dentro de `www/` e faça commit. Um novo APK é gerado.
