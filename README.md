# OPTIMAL PORTFOLIO — Frontier Lab

An interactive portfolio-construction lab for 35 assets (US and Asian tech, AI infrastructure, Spanish infrastructure and utilities, financials, defensives, commodities, Bitcoin and US Treasuries), built on 30 years of real monthly prices (October 1996 – October 2026), including the dot-com crash and the 2008 financial crisis.

**Live app: https://gabichu18.github.io/OPTIMAL-PORTFOLIO/**

It runs entirely in the browser: use the live link above, or download the repo and open `index.html`. There is no server, no build step and no dependencies; the data is embedded in the page.

## What it does

| Area | Methods |
|---|---|
| Expected returns | Black-Litterman (CAPM equilibrium prior + your views with confidence levels), history–CAPM blend, or pure history |
| Risk model | Pairwise sample correlations on each asset's own history, Ledoit-Wolf (2003) optimal shrinkage toward constant correlation, eigenvalue repair to keep the matrix positive semi-definite |
| Portfolios | Max Sharpe (tangency), min variance, max Sortino and min downside (iterative semicovariance), risk parity (equal risk contribution), Michaud resampled, equal weight, or your own weights |
| Target risk | Slider that picks the highest-expected-return portfolio on the efficient frontier for a chosen volatility, with its Sharpe ratio and historical max drawdown |
| Asset pages | Click any asset (Assets tab, allocation list, tables) for a full page: growth vs S&P 500, drawdowns, calendar-year returns, rolling return and volatility, return distribution with skew and kurtosis, crisis performance, alpha and beta, its role in each portfolio and its best diversifiers. Deep link with `#TICKER-ID`, e.g. `#NVDA` |
| 2008–09 exclusion | Button that removes Dec 2007 – Jun 2009 (NBER recession) from the model's estimation to test its influence; backtests and stress tests keep the full history |
| Frontier | Efficient frontier, capital market line, 4,000 random portfolios |
| Currency | Base currency switch: USD, EUR unhedged, EUR fully hedged, or EUR with only Treasuries hedged |
| CAPM & alpha | Betas vs S&P 500 (SPY with dividends), security market line, expected Jensen's alpha, Treynor; realized alpha from a regression on S&P 500 excess returns with monthly T-bill rates, t-statistic, R², tracking error, information and appraisal ratios, cumulative alpha chart |
| Downside risk | Downside deviation vs a minimum acceptable return, Sortino, downside beta, historical VaR and CVaR (95%), max drawdown, time underwater, Calmar, Omega |
| Risk budget | Risk contribution per asset, diversification ratio, top-3 risk concentration |
| Stress tests | 1998 LTCM/Russia crisis, dot-com crash (2000–02), 2008 financial crisis, 2011 euro debt crisis, 2015–16 China/oil rout, Q4 2018, COVID crash, 2022 bear market, March 2023 bank stress, 2025 tariff shock, worst rolling 12 months |
| Backtests | In-sample, and walk-forward out-of-sample from October 2001 (quarterly re-estimation on a trailing 5-year window) with turnover |
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

- Window: October 1996 – 9 October 2026, 361 monthly returns, all in USD with dividends reinvested. The estimation window can be cut to 20, 15, 10 or 5 years in the app.
- US listings: Yahoo Finance adjusted closes.
- Non-US listings (Xiaomi in HKD, Samsung and SK Hynix in KRW, Inditex, Ferrovial and Iberdrola in EUR): from October 2011, Yahoo adjusted closes converted at Yahoo month-end FX (a handful of corrupted KRW quotes removed). Before 2011, total return is rebuilt from Yahoo closes plus cash dividends, because Yahoo's adjusted close for some of these contains bad dividend factors, and converted at FRED month-end FX (DEXUSEU, DEXKOUS).
- Ferrovial: an unadjusted 5:1 split on 27 Oct 2004 is neutralised. SK Hynix starts in February 2004, after its 2003 restructuring. Vertiv starts in February 2020 (earlier prices are the pre-merger SPAC).
- Stand-in series: US Treasuries use IEF from August 2002 and Vanguard's Intermediate-Term Treasury fund (VFITX) before. Global energy is the Xtrackers MSCI World Energy UCITS ETF (XDW0) from May 2016, iShares Global Energy (IXC) from December 2001 and Vanguard's energy fund (VGENX) before. Copper miners use the UCITS ETF (4COP, EUR→USD) from November 2021 and the US-listed COPX before. Gold uses the front-month future (GC=F) from September 2000. Futures roll yield is not captured.
- Listing dates: assets enter when they start trading (Amazon 1997, TSMC ADR 1997, Nvidia 1999, Goldman Sachs 1999, Ferrovial/Iberdrola/Samsung 2000 on Yahoo, Inditex 2001, Google 2004, Broadcom 2009, Meta 2012, Bitcoin 2014, Vistra 2016, Xiaomi 2018, CrowdStrike 2019, Vertiv 2020).
- Unequal histories: for the risk model, months before an asset listed are filled with alpha + beta × S&P 500 + one of the asset's own residuals drawn at random, so volatilities and correlations of young assets include the dot-com crash and 2008. Historical means of young assets are adjusted for how the market did while they traded (Stambaugh, 1997). Backtests and stress tests never use filled months; weights are re-scaled over the assets that were trading.
- Base currency: the app can show everything in USD, or in EUR unhedged, fully hedged, or with only Treasuries hedged (default). Unhedged converts at month-end EUR/USD (FRED; Deutsche Mark at the fixed conversion rate before 1999). Hedged subtracts the gap between the US T-bill and the euro 3-month rate each month, which is what a rolling FX forward costs or earns. The euro risk-free rate is the ECB deposit rate (2.50% on 9 Oct 2026).
- Risk-free rate: 13-week US T-bill. Forward-looking figures use today's 4.06%; realized alpha uses each month's actual T-bill rate.

## Caveats

- **Selection bias.** The 35 assets were chosen in 2026, partly because they did well. Every backtest, including walk-forward, benefits from that hindsight.
- **Estimation error.** Expected returns are the noisiest input. The walk-forward results show the rolling max-Sharpe optimizer losing to equal weight out of sample (DeMiguel, Garlappi & Uppal, 2009).
- **Currency hedging is simplified.** Hedged views assume a monthly rolling forward at the short-rate gap, with no transaction costs; real hedged share classes cost a little more.
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
- Stambaugh, R. (1997). Analyzing Investments Whose Histories Differ in Length. *Journal of Financial Economics*.
- DeMiguel, V., Garlappi, L. & Uppal, R. (2009). Optimal Versus Naive Diversification. *Review of Financial Studies*.
