# Ativar GitHub Pages

O repositório já contém o workflow `.github/workflows/pages.yml`, que publica o conteúdo da raiz da branch `main`.

A primeira execução foi bloqueada porque o Pages ainda não estava habilitado no repositório. Para liberar a publicação inicial:

1. Abra [Settings → Pages](https://github.com/CrazyFrog-zxv3/Synzer/settings/pages).
2. Em **Build and deployment → Source**, selecione **GitHub Actions**.
3. Salve, se o GitHub solicitar.

Depois disso, o workflow será executado em novos pushes para `main`. A URL esperada é:

https://crazyfrog-zxv3.github.io/Synzer/

A URL só deve ser considerada publicada depois que o deployment do workflow terminar com sucesso e a página responder por HTTPS.
