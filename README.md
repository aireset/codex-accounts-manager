# Codex Accounts Manager

[Português (Brasil)](README.md) · [English](README.en.md)

Extensão do VS Code para gerenciar várias contas Codex, visualizar cotas e alternar o `auth.json` global ativo.

![Version](https://img.shields.io/badge/version-0.1.10-blue)
![VS Code](https://img.shields.io/badge/VS%20Code-%5E1.96.0-007acc)
![License](https://img.shields.io/github/license/wannanbigpig/codex-tools)
![Stars](https://img.shields.io/github/stars/wannanbigpig/codex-tools?style=flat)
![Last Commit](https://img.shields.io/github/last-commit/wannanbigpig/codex-tools)

---

Gerencie múltiplas contas Codex no VS Code, consulte o uso de cotas, troque a conta ativa e acompanhe informações importantes pela barra de status.

**Recursos:** painel de cotas, gerenciamento de múltiplas contas, login via OAuth, detecção e vínculo inicial de conta local, atualização imediata de cota após importação, sincronização entre janelas, restauração/exportação por JSON compartilhado, integração com Codex App, troca automática de conta, atualização automática de token em segundo plano, painel de detalhes e interface multilíngue.

**Idioma:** segue o idioma atual do VS Code por padrão, com suporte dedicado a Português (Brasil), inglês, chinês simplificado e outros idiomas localizados na interface.

**Ecossistema:** se você precisa de gerenciamento de sessão mais completo, inicialização de CLI ou coordenação com múltiplas instâncias, também pode usar o plugin uTools **AiDeck**: [https://github.com/wannanbigpig/aideck](https://github.com/wannanbigpig/aideck).

---

## Prévia

| Painel de cotas | Painel de detalhes |
| --- | --- |
| <img src="https://raw.githubusercontent.com/wannanbigpig/codex-tools/master/media/dashboard.png" alt="Painel de cotas do Codex Accounts Manager" width="420" /> | <img src="https://raw.githubusercontent.com/wannanbigpig/codex-tools/master/media/detail.png" alt="Painel de detalhes do Codex Accounts Manager" width="420" /> |
| Painel de configurações | Barra de status |
| <img src="https://raw.githubusercontent.com/wannanbigpig/codex-tools/master/media/setting.png" alt="Painel de configurações do Codex Accounts Manager" width="260" /> | <img src="https://raw.githubusercontent.com/wannanbigpig/codex-tools/master/media/status_bar.png" alt="Barra de status do Codex Accounts Manager" width="220" /> |

---

## Visão geral

### Painel de cotas

A extensão fornece um painel Webview para gerenciar e monitorar todas as contas Codex salvas em um só lugar:

- Resumo da conta atual com equipe e ações rápidas
- Indicadores de cota para 5 horas, semanal e revisão de código
- Lista de contas salvas para gerenciamento centralizado
- Ações rápidas para adicionar, importar, exportar e atualizar tudo
- Acesso a detalhes, reautorização, resincronização, edição de tags e restauração por JSON

### Gerenciamento de múltiplas contas

- Adicione novas contas por OAuth
- Detecte um `auth.json` local do Codex quando ainda não houver contas salvas
- Vincule a conta detectada à extensão com um clique
- Importe o `auth.json` atualmente ativo
- Atualize cotas imediatamente após vínculo ou importação
- Armazene várias contas localmente
- Troque a conta ativa com um clique
- Remova contas que você não usa mais
- Restaure contas a partir de backup, `auth.json` ou JSON compartilhado

### Sincronização entre janelas

- Observa alterações no `auth.json` global
- Sincroniza automaticamente a conta ativa quando outra janela do VS Code faz a troca
- Pode solicitar recarga da janela atual para sincronizar a sessão embutida do Codex

### Integração com Codex App

- Detecta se o Codex App está instalado ao trocar de conta
- Pode reiniciar automaticamente o aplicativo se ele já estiver em execução
- Também oferece modo manual de confirmação antes do reinício
- Permite configurar um caminho personalizado para o aplicativo desktop
- Suporta padrões comuns de instalação e processo em macOS, Windows e Linux

### Troca automática e alertas de cota

- Troca automaticamente para outra conta quando a conta ativa atinge limites definidos
- Limites separados para cota de 5 horas e semanal
- Bloqueio temporário para evitar trocas repetidas logo após uma mudança
- Alertas localizados quando a cota restante cai abaixo do limite configurado

### Atualização de token em segundo plano

- Atualiza tokens de contas salvas antes que expirem
- Exibe último check, última atualização, próxima verificação e último erro
- Pode ser desativada quando você preferir apenas fluxos manuais

### Visualização de cotas

Cada conta pode exibir:

- Percentual da cota de 5 horas
- Percentual da cota semanal
- Percentual da cota de revisão de código
- Tempo restante para reset
- Última atualização

### Monitoramento pela barra de status

- Mostra o resumo da cota da conta atual na barra de status do VS Code
- Permite fixar contas selecionadas no pop-up da barra de status
- Abre o painel completo de cotas ao clicar no item da barra de status

### Interface multilíngue

- Segue automaticamente o idioma atual do VS Code
- Permite escolher um idioma específico apenas para esta extensão
- Localiza painel, detalhes, notificações e interações principais
- Inclui suporte dedicado a Português (Brasil)

### Painel de detalhes

Abra um painel por conta para consultar:

- E-mail da conta
- Informações de equipe / organização
- ID do usuário / ID da conta
- Dados brutos de cota
- Tags e bloqueio temporário de troca automática

### Anúncios de atualização

- O dashboard mostra anúncios no centro de mensagens e em pop-ups
- Suporta marcar anúncios como lidos individualmente ou todos de uma vez
- `announcements.json` mantém os anúncios da versão atual, enquanto o histórico fica em [docs/CHANGELOG.md](docs/CHANGELOG.md)

---

## Configurações

Você pode alterar essas opções pelo botão de configurações no canto superior direito do painel ou em VS Code Settings, procurando por `codexAccounts`.

- `Idioma`
  - `Automático (seguir VS Code)` ou um idioma suportado manualmente
  - Afeta apenas textos desta extensão
- `Política de reinício do Codex App`
  - Desativada por padrão
  - Permite escolher entre `Reiniciar automaticamente` e `Perguntar sempre`
- `Atualização automática de cotas`
  - Pode ser desativada ou ajustada entre `1` e `60` minutos
- `Atualização de token em segundo plano`
  - Mantém tokens válidos enquanto o VS Code permanece aberto
- `Troca automática de conta`
  - Define limites de 5 horas e semanal para troca automática
- `Bloqueio temporário`
  - Define a duração padrão do bloqueio manual contra troca automática
- `Caminho do Codex App`
  - Permite informar um caminho personalizado para o aplicativo desktop
- `Tema do painel`
  - `auto`, `light` ou `dark`
- `Exibição do painel`
  - Permite mostrar ou ocultar a cota de Code Review
- `Alerta de cota`
  - Exibe notificações quando a cota restante cai abaixo do limite configurado
- `Limites de cor`
  - Ajusta os limiares de verde e amarelo no painel
- `Recuperação de contas`
  - Permite restaurar contas de backup, `auth.json` ou JSON compartilhado

---

## Uso

1. Instale a extensão
2. Na primeira execução, se já existir um `auth.json` local do Codex, a extensão poderá vinculá-lo e atualizar a cota
3. Execute `Contas Codex: Adicionar conta via OAuth`
4. Ou execute `Contas Codex: Importar auth.json atual`
5. Execute `Contas Codex: Mostrar resumo de cotas`
6. Use o painel para atualizar cotas, alternar contas, exportar/importar dados, gerenciar tags e controlar a barra de status
7. Abra os detalhes da conta para inspecionar informações brutas e corrigir problemas de sessão ou credenciais

### Como migrar contas para outro computador

1. Selecione as contas desejadas na interface
2. Clique em `Exportar selecionadas`
3. Instale a extensão no novo computador
4. Use a importação por JSON compartilhado na janela de adicionar conta
5. Conclua a restauração das contas

---

## Comandos

Comandos disponíveis na Paleta de Comandos do VS Code:

- `Contas Codex: Adicionar conta via OAuth`
- `Contas Codex: Importar auth.json atual`
- `Contas Codex: Alternar conta`
- `Contas Codex: Atualizar cota`
- `Contas Codex: Atualizar todas as cotas`
- `Contas Codex: Restaurar contas do backup`
- `Contas Codex: Restaurar contas do auth.json`
- `Contas Codex: Restaurar contas do JSON compartilhado`
- `Contas Codex: Remover conta`
- `Contas Codex: Abrir detalhes`
- `Contas Codex: Abrir página inicial do Codex`
- `Contas Codex: Mostrar resumo de cotas`

---

## Instalação

A extensão pode ser instalada pelo Visual Studio Marketplace, por `.vsix` ou executada a partir do código-fonte.

### Opção 1: instalar pelo Marketplace

1. Abra a visualização Extensions no VS Code
2. Procure por `Codex Accounts Manager`
3. Encontre a extensão publicada por `wannanbigpig` e clique em instalar

Ou acesse diretamente:

[Codex Accounts Manager - Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=wannanbigpig.codex-accounts-manager)

### Opção 2: instalar por VSIX

1. Baixe o arquivo `.vsix` publicado
2. Abra a Paleta de Comandos no VS Code
3. Execute `Extensions: Install from VSIX...`
4. Selecione o arquivo `.vsix`

Ou use a linha de comando:

```bash
code --install-extension codex-accounts-manager-x.y.z.vsix
```

### Opção 3: executar a partir do código-fonte

```bash
git clone https://github.com/wannanbigpig/codex-tools.git
cd codex-tools
npm install
npm run compile
```

Pressione `F5` no VS Code para abrir um Extension Development Host.

---

## Empacotar VSIX

```bash
npx @vscode/vsce package
```

---

## Observações

- Os dados das contas são armazenados localmente
- Trocar contas atualiza o `auth.json` ativo da máquina
- Importações e vínculos locais atualizam a cota imediatamente
- Alterações feitas por outra janela são detectadas automaticamente
- O reinício do Codex App só acontece quando ele já está em execução
- A visualização de cota depende dos dados retornados pela sessão atual do Codex

---

## Suporte

- ⭐ [GitHub Star](https://github.com/wannanbigpig/codex-tools)
- 💬 [Reportar problema](https://github.com/wannanbigpig/codex-tools/issues)

---

## 💝 Apoie o projeto

Obrigado por usar o `Codex Accounts Manager`.

Se este projeto ajudar você, considere apoiar o desenvolvimento e a manutenção contínuos.

[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20A%20Coffee-apoiar%20autor-orange?style=for-the-badge&logo=buy-me-a-coffee)](https://github.com/wannanbigpig/codex-tools/blob/master/docs/DONATE.md)

---

## Licença

Este projeto é distribuído sob a [MIT License](LICENSE).
