# Unidades-UnimedLab

Mapa operacional e responsivo para localizar as unidades da **Unimed Laboratório** em Curitiba e Região Metropolitana.

## Objetivo

Substituir a consulta manual em uma folha/mapa estático durante atendimentos telefônicos. A atendente pode informar um endereço, bairro, empresa ou ponto de referência e visualizar rapidamente as unidades mais próximas.

## Recursos

- 25 unidades públicas mapeadas.
- Busca por endereço, bairro, empresa ou ponto de referência.
- Cálculo das 3 unidades mais próximas.
- Identificação automática do bairro de Curitiba quando o ponto cai dentro da malha do IPPUC.
- Clique em qualquer ponto do mapa para usar como referência.
- Uso da localização atual do aparelho, mediante permissão.
- Limites e nomes dos bairros de Curitiba usando a base geográfica pública do IPPUC.
- Limites dos municípios da Região Metropolitana relevantes para a operação.
- Zoom até o nível da rua para ajudar a informar pontos de referência.
- Links diretos para Google Maps, rota e Waze.
- Botão para copiar rapidamente o endereço de uma unidade durante o atendimento.
- Filtros por cidade, bairro e nome da unidade.
- Layout mobile-first para uso no celular e também otimizado para desktop.

## Como usar no atendimento

1. Digite o local informado pela pessoa, como rua, bairro, empresa ou shopping.
2. Selecione o resultado correto da busca.
3. O sistema marca o ponto, identifica o bairro quando possível e calcula as 3 unidades mais próximas.
4. Use **Ver no mapa** para aproximar até a rua ou **Rota** para comparar o deslocamento real.
5. Se o endereço for impreciso, use **Marcar no mapa** e toque aproximadamente onde a pessoa está.

> A distância exibida no ranking é aproximada em linha reta. A melhor unidade por tempo de deslocamento deve ser confirmada pela rota.

## Fontes de dados

A relação de unidades foi consolidada com base em materiais públicos da Unimed Curitiba/Unimed Laboratório e registros públicos revisados em 31/08/2026.

Os limites de bairros e municípios são carregados do serviço geográfico público do **IPPUC / GeoCuritiba**. O mapa-base utiliza **OpenStreetMap**. A busca de endereços utiliza o **ArcGIS World Geocoding Service**.

> Este projeto é uma ferramenta independente de apoio operacional. Horários, exames, vacinas e disponibilidade devem ser confirmados nos canais oficiais da Unimed Laboratório.

## Publicação

O repositório contém um workflow em `.github/workflows/pages.yml` preparado para GitHub Pages.

Se o Pages ainda não estiver habilitado, abra:

**Settings → Pages → Build and deployment → Source → GitHub Actions**

Depois disso, cada push para `main` publica automaticamente a versão atual.

## Estrutura

```text
.
├── index.html
├── manifest.webmanifest
├── assets/
│   ├── app.js
│   ├── styles.css
│   └── favicon.svg
├── data/
│   └── unidades.js
└── .github/workflows/
    └── pages.yml
```
