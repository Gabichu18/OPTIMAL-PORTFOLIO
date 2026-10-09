# OPTIMAL PORTFOLIO — Frontier Lab

An interactive portfolio-construction lab for 32 assets (US and Asian tech, AI infrastructure, financials, defensives, commodities, Bitcoin and US Treasuries), built on 15 years of real monthly prices (October 2011 – October 2026).

**Live app: https://gabichu18.github.io/OPTIMAL-PORTFOLIO/**

It runs entirely in the browser: use the live link above, or download the repo and open `index.html`. There is no server, no build step and no dependencies; the data is embedded in the page.

## What it does

| Area | Methods |
|---|---|
| Expected returns | Black-Litterman (CAPM equilibrium prior + your views with confidence levels), history–CAPM blend, or pure history |
| Risk model | Pairwise sample correlations on each asset's own history, Ledoit-Wolf (2003) optimal shrinkage toward constant correlation, eigenvalue repair to keep the matrix positive semi-definite |
| Portfolios | Max Sharpe (tangency), min variance, max Sortino and min downside (iterative semicovariance), risk parity (equal risk contribution), Michaud resampled, equal weight, or your own weights |
| Frontier | Efficient frontier, capital market line, 4,000 random portfolios |
| CAPM & alpha | Betas vs S&P 500 (SPY with dividends), security market line, expected Jensen's alpha, Treynor; realized alpha from a regression on S&P 500 excess returns with monthly T-bill rates, t-statistic, R², tracking error, information and appraisal ratios, cumulative alpha chart |
| Downside risk | Downside deviation vs a minimum acceptable return, Sortino, downside beta, historical VaR and CVaR (95%), max drawdown, time underwater, Calmar, Omega |
| Risk budget | Risk contribution per asset, diversification ratio, top-3 risk concentration |
| Stress tests | 2015–16 China/oil rout, Q4 2018, COVID crash, 2022 bear market, March 2023 bank stress, 2025 tariff shock, worst rolling 12 months |
| Backtests | In-sample, and walk-forward out-of-sample (quarterly re-estimation on a trailing 5-year window) with turnover |
| Monte Carlo | Block bootstrap of real months (re-centred on forward expected returns) or log-normal; percentile fan, distribution of annual returns, 1-year VaR/CVaR, drawdowns; compares your weights with max Sharpe |

Every figure recomputes as you move the weight sliders.

## Project structure

```
index.html                    the built app (open this)
src/app.template.html         page markup, UI logic and charts
src/style.css                 styles (dark and light themes)
src/engine.js                 all the maths: estimation, Black-Litterman, Ledoit-Wolf, optimizers, risk stats, Monte Carlo, walk-forward
data/monthly_returns_bp.txt   monthly USD total returns in basis points
scripts/fetch_data.py         refresh the data from Yahoo Finance
scripts/build.py              rebuild index.html from src/ and data/
```

## Refreshing the data

```bash
pip install yfinance pandas
python scripts/fetch_data.py
python scripts/build.py
```

## Data notes

- Source: Yahoo Finance adjusted closes (dividends and splits included), monthly.
- Non-USD listings (Xiaomi in HKD, Samsung and SK Hynix in KRW, Inditex in EUR) are converted to USD at month-end FX rates. A handful of corrupted KRW/USD quotes on Yahoo were removed and interpolated.
- Gold and Brent use front-month futures (`GC=F`, `BZ=F`); short gaps are interpolated. Futures roll yield is not captured.
- Copper miners: the shipped data uses the UCITS ETF (4COP, EUR→USD) since November 2021 and the US-listed COPX before that. `fetch_data.py` uses COPX throughout.
- Vertiv starts in February 2020; earlier prices belong to the pre-merger SPAC shell.
- Assets that listed after 2011 (Meta, Vertiv, Vistra, Arista, Xiaomi, CrowdStrike, Bitcoin) are estimated on their own history. For tools that need a complete history (Monte Carlo bootstrap, downside optimization) their earlier months are back-filled from their beta to the S&P 500. Backtests and stress tests never use back-filled months; weights are re-scaled over the assets that were trading.
- Risk-free rate: 13-week US T-bill. Forward-looking figures use today's 4.06%; realized alpha uses each month's actual T-bill rate.

## Caveats

- **Selection bias.** The 32 assets were chosen in 2026, partly because they did well. Every backtest, including walk-forward, benefits from that hindsight.
- **Estimation error.** Expected returns are the noisiest input. The walk-forward results show the rolling max-Sharpe optimizer losing to equal weight out of sample (DeMiguel, Garlappi & Uppal, 2009).
- **Single currency.** Everything is in USD; EUR/USD exposure for a euro-based investor is not modelled.
- This is an educational and analytical tool, not investment advice.

## References

- Markowitz, H. (1952). Portfolio Selection. *Journal of Finance*.
- Sharpe, W. (1964). Capital Asset Prices. *Journal of Finance*.
- Black, F. & Litterman, R. (1992). Global Portfolio Optimization. *Financial Analysts Journal*.
- Idzorek, T. (2005). A Step-by-Step Guide to the Black-Litterman Model.
- Ledoit, O. & Wolf, M. (2004). Honey, I Shrunk the Sample Covariance Matrix. *Journal of Portfolio Management*.
- Michaud, R. (1998). *Efficient Asset Management*.
- Estrada, J. (2008). Mean-Semivariance Optimization: A Heuristic Approach. *Journal of Applied Finance*.
- Maillard, S., Roncalli, T. & Teïletche, J. (2010). The Properties of Equally Weighted Risk Contribution Portfolios. *Journal of Portfolio Management*.
- DeMiguel, V., Garlappi, L. & Uppal, R. (2009). Optimal Versus Naive Diversification. *Review of Financial Studies*.
