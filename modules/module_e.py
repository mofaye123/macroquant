import streamlit as st
import pandas as pd
import plotly.graph_objects as go

def render_module_e(df_all):
    """
    E模块: 外部冲击与汇率 (External Shocks & FX)
    """
    # 1. 数据准备
    df = df_all.copy()
    required_cols = ['DTWEXBGS', 'DXY', 'DEXJPUS', 'IRSTCI01JPM156N', 'DCOILWTICO', 'DHHNGSP']
    if df.dropna(subset=required_cols).empty:
        st.warning("E模块数据不足（外部汇率/能源），请稍后刷新。")
        return

    def prev_week_row(frame, days=7):
        target = frame.index[-1] - pd.Timedelta(days=days)
        idx = frame.index.get_indexer([target], method='nearest')[0]
        return frame.iloc[idx]
    
    df['IRSTCI01JPM156N'] = df['IRSTCI01JPM156N'].fillna(method='ffill')
    df = df.fillna(method='ffill')
    df = df.dropna(subset=required_cols)

    # ==========================================
    # 2. 因子计算 
    # ==========================================
    
    # 美元 (涨=坏)
    df['Chg_USD'] = df['DTWEXBGS'].pct_change(63) 
    df['Score_USD'] = (1 - df['Chg_USD'].rolling(1260, min_periods=1).rank(pct=True)) * 100

    df['Chg_DXY'] = df['DXY'].pct_change(63)
    df['Score_DXY'] = (1 - df['Chg_DXY'].rolling(1260, min_periods=1).rank(pct=True)) * 100
    

    # 日元 (USD/JPY 跌 = 坏)
    df['Yen_Appreciation'] = -1 * df['DEXJPUS'].pct_change(63)
    df['Score_Yen_FX'] = (1 - df['Yen_Appreciation'].rolling(1260, min_periods=1).rank(pct=True)) * 100
    
    # 无抵押隔夜拆借利率 (高=坏)

    df['Score_BoJ_Rate'] = (1 - df['IRSTCI01JPM156N'].rolling(1260, min_periods=1).rank(pct=True)) * 100
    df['Score_Yen_Total'] = df['Score_Yen_FX'] * 0.7 + df['Score_BoJ_Rate'] * 0.3

    df['Chg_Oil'] = df['DCOILWTICO'].pct_change(63)
    df['Score_Oil'] = (1 - df['Chg_Oil'].rolling(1260, min_periods=1).rank(pct=True)) * 100
    
    df['Chg_Gas'] = df['DHHNGSP'].pct_change(63)
    df['Score_Gas'] = (1 - df['Chg_Gas'].rolling(1260, min_periods=1).rank(pct=True)) * 100
    
    df['Score_Energy'] = df['Score_Oil'] * 0.5 + df['Score_Gas'] * 0.5

    # 3. 综合得分
    df['Total_Score'] = (
        df['Score_USD'] * 0.2 +
        df['Score_DXY'] * 0.2 +
        df['Score_Yen_Total'] * 0.3 +
        df['Score_Energy'] * 0.3
    )

    # 4. 展示
    df_view = df[df.index >= '2020-01-01'].copy()
    
    latest = df.iloc[-1]
    prev_week = prev_week_row(df)

    c1, c2, c3, c4 = st.columns(4)
    
    score_color = "#09ab3b" if latest['Total_Score'] > 50 else "#ff2b2b"
    c1.markdown(f"""
        <div class="metric-card">
            <div class="metric-label">E模块综合得分 (日频)</div>
            <div class="metric-value" style="color: {score_color}">{latest['Total_Score']:.1f}</div>
            <div class="metric-label">vs上周: {latest['Total_Score'] - prev_week['Total_Score']:.1f}</div>
        </div>
    """, unsafe_allow_html=True)

    c2.metric("DXY Index (Yahoo)", f"{latest['DXY']:.2f}", 
                  f"{(latest['DXY'] - prev_week['DXY']):.2f}(vs上周)", delta_color="inverse")
    c3.metric("日本无抵押隔夜拆借利率", f"{latest['IRSTCI01JPM156N']:.3f}%", f"{(latest['IRSTCI01JPM156N'] - prev_week['IRSTCI01JPM156N']):.3f}% (vs上周)", delta_color="inverse")
    c4.metric("WTI 原油", f"${latest['DCOILWTICO']:.1f}", f"{(latest['DCOILWTICO'] - prev_week['DCOILWTICO']):.1f} (vs上周)", delta_color="inverse")

    st.markdown("<br>", unsafe_allow_html=True)
    st.markdown("##### 🧩 因子细分得分")
    s1, s2, s3, s4 = st.columns(4)
    def sub_card(label, val):
        col = "#09ab3b" if val > 50 else "#ff2b2b"
        return f"""<div class="sub-card"><div class="sub-label">{label}</div><div class="sub-value" style="color:{col}">{val:.1f}</div></div>"""
    s1.markdown(sub_card("美元流动性 (20%)", latest['Score_USD']), unsafe_allow_html=True)
    s2.markdown(sub_card("DXY Index (Yahoo) (20%)", latest['Score_DXY']), unsafe_allow_html=True) 
    s3.markdown(sub_card("日元套息压力 (30%)", latest['Score_Yen_Total']), unsafe_allow_html=True)      
    s4.markdown(sub_card("能源成本压力 (30%)", latest['Score_Energy']), unsafe_allow_html=True)

    st.divider()
    
    col1, col2 = st.columns(2)
    with col1:
        fig_jp = go.Figure()
        fig_jp.add_trace(go.Scatter(x=df_view.index, y=df_view['DEXJPUS'], name='USD/JPY', line=dict(color='#0068c9', width=2)))
        fig_jp.add_trace(go.Scatter(x=df_view.index, y=df_view['IRSTCI01JPM156N'], name='BoJ Rate', line=dict(color='#ff2b2b', width=2, dash='dot'), yaxis='y2'))
        fig_jp.update_layout(title="日元：汇率 vs 日本无抵押隔夜拆借利率", height=350, yaxis2=dict(overlaying='y', side='right'), hovermode="x unified")
        st.plotly_chart(fig_jp, use_container_width=True)
    
    with col2:
        fig_usd = go.Figure()
        if 'DXY' in df_view.columns:
            fig_usd.add_trace(go.Scatter(x=df_view.index, y=df_view['DXY'], name='DXY (Yahoo)', line=dict(color='#2ca02c', width=2)))
        fig_usd.add_trace(go.Scatter(x=df_view.index, y=df_view['DTWEXBGS'], name='Broad USD', line=dict(color='#888', width=2, dash='dot'), yaxis='y2'))
        
        fig_usd.update_layout(height=350, title="美元指数", 
                              yaxis=dict(title='DXY Index'), yaxis2=dict(title='Broad Index', overlaying='y', side='right', showgrid=False),
                              hovermode="x unified", legend=dict(orientation="h", y=1.1), paper_bgcolor='rgba(0,0,0,0)', plot_bgcolor='rgba(0,0,0,0)')
        st.plotly_chart(fig_usd, use_container_width=True)

    
    st.markdown("<br>", unsafe_allow_html=True) 
    st.markdown("######  E模块综合得分趋势")
    
    fig_sc = go.Figure()
    fig_sc.add_trace(go.Scatter(x=df_view.index, y=df_view['Total_Score'], name='E模块得分', line=dict(color='#d97706', width=2), fill='tozeroy', fillcolor='rgba(217, 119, 6, 0.1)'))
    fig_sc.add_hline(y=50, line_dash="dash", line_color="#888")
    
    fig_sc.update_layout(
        height=350, 
        yaxis=dict(range=[0,100]), 
        hovermode="x unified", 
        paper_bgcolor='rgba(0,0,0,0)', 
        plot_bgcolor='rgba(0,0,0,0)',
        margin=dict(l=0, r=0, t=30, b=0) 
    )
    
    st.plotly_chart(fig_sc, use_container_width=True)

    #百科
    st.markdown("<br>", unsafe_allow_html=True)
    with st.expander("📚 E模块：因子专业定义与市场逻辑 (点击展开)", expanded=False):
        st.markdown("""
        <div class="glossary-box" style="border-left: 4px solid #d97706; background-color: #fff8e1;">
            <div class="glossary-title" style="color: #d97706;">📊 核心量化模型逻辑 (Methodology)</div>
            <div class="glossary-content">
                本模块得分基于 <b>63天动量趋势</b> + <b>历史分位</b>，满分 100 分（50分=中性）：<br>
                • <b>1. 日元 (The Carry Trade Anchor)：</b> 监测全球融资成本是否上升（利率）以及是否发生平仓（汇率）。<br>
                • <b>2. 美元 (Global Liquidity)：</b> 监测全球美元流动性的松紧。<br>
                • <b>3. 能源 (Input Cost)：</b> 监测通胀输入的压力 （石油+天然气）。
            </div>
        </div>
        
        <div class="glossary-box">
            <div class="glossary-title">因子 1：日本无抵押隔夜拆借利率 (Call Rate)</div>
            <div class="glossary-content">
                <span class="glossary-label">数据源：</span> 银行间无担保隔夜拆借利率 (Call Rate)，是市场实际成交的短端利率。<br>
                <span class="glossary-label">核心逻辑：</span> 这是全球套息交易 (Carry Trade) 的<b>“资金成本底座”</b>。虽然央行设定了政策目标利率，但这个市场利率反映了金融体系<b>实际的资金稀缺程度</b>。<br>
                <span class="glossary-label">传导机制：</span> 对冲基金借入低息日元(Short JPY) -> 买入美股/美债(Long USD)。如果这个利率上涨，意味着<b>“借钱买资产”的成本变高</b>，杠杆收益下降，迫使资金去杠杆。<br>
            </div>
            <div class="logic-row">
                <span class="bullish">⬇️ 利率低位/平稳 = 🟢 利好 (借钱便宜/杠杆继续)</span>
                <span class="bearish">⬆️ 利率中枢上移 = 🔴 利空 (借钱变贵/被迫平仓)</span>
            </div>
        </div>
       

        <div class="glossary-box">
            <div class="glossary-title">因子 2：日元 USD/JPY 汇率</div>
            <div class="glossary-content">
                <span class="glossary-label">核心风向标：</span> 套息交易 (Carry Trade) 的命门。过去几十年，全球对冲基金借入低息日元，买入高息美股/美债。<br>
                <span class="glossary-label">风险：</span> 当日元大幅升值 (USD/JPY 暴跌) 时，借日元的人还款成本激增，被迫卖资产、换日元、还债。这会引发跨资产类别的连锁崩盘。<br>
            </div>
            <div class="logic-row">
                <span class="bullish">⬆️ 汇率上行 (日元贬值) = 🟢 利好 (套息继续/流动性充裕)</span>
                <span class="bearish">⬇️ 汇率暴跌 (日元升值) = 🔴 利空 (平仓踩踏/流动性休克)</span>
            </div>
        </div>

        <div class="glossary-box">
            <div class="glossary-title">因子 3：美元指数 (The Dollar)</div>
            <div class="glossary-content">
                <b>1. DXY Major (金融属性)：</b> 以欧元、日元为主。<br>
                <span class="glossary-label">逻辑：</span> 主要影响发达国家市场和金融衍生品。DXY 飙升通常代表全球金融体系在“去杠杆”，是避险模式 (Risk-Off) 的特征。<br><br>
                <b>2. Broad Dollar (贸易属性)：</b> 包含人民币、比索等主要贸易伙伴货币。<br>
                <span class="glossary-label">逻辑：</span> 主要影响实体经济和新兴市场。该指数走强，意味着全球贸易融资成本变贵，新兴市场偿债压力剧增，易引发债务违约危机。
            </div>
            <div class="logic-row">
                <span class="bullish">⬇️ 美元下行 = 🟢 利好 (全球信用扩张)</span>
                <span class="bearish">⬆️ 美元上行 = 🔴 利空 (全球紧缩/去杠杆)</span>
            </div>
        </div>

        <div class="glossary-box">
            <div class="glossary-title">因子 4：原油 (WTI Crude Oil)</div>
            <div class="glossary-content">
                <span class="glossary-label">含义：</span> 油价不仅是成本，更被视为对经济增长的征税。<br>
                <span class="glossary-label">量化逻辑：</span> 13周动量监测。模型并不在意油价的绝对高低，而在意变化速度。如果油价在短期内（1个季度）暴涨 >20%，将引发通胀预期失控，迫使美联储维持高利率 (Higher for Longer)。
            </div>
            <div class="logic-row">
                <span class="bullish">⬇️ 平稳/下跌 = 🟢 利好 (通胀温和)</span>
                <span class="bearish">⬆️ 暴涨 (>20%) = 🔴 利空 (滞胀风险)</span>
            </div>
        </div>

        <div class="glossary-box">
            <div class="glossary-title">因子 5：天然气 (Natural Gas)</div>
            <div class="glossary-content">
                <span class="glossary-label">含义：</span> 工业生产与电力成本的边际变量。相比原油，天然气的波动率极高，且具有更强的季节性和地缘政治属性（如欧洲/俄罗斯关系）。监测供给侧冲击。<br>
                <span class="glossary-label">量化逻辑：</span> 辅助监测。防止能源价格共振。若天然气与原油同时飙升，模型会判定为“结构性通胀风险”，加倍扣分。
            </div>
            <div class="logic-row">
                <span class="bullish">⬇️ 低位震荡 = 🟢 利好 (成本可控)</span>
                <span class="bearish">⬆️ 与原油共振飙升 = 🔴 利空 (通胀失控)</span>
            </div>
        </div>

        <div class="glossary-box" style="border-left: 4px solid #ff2b2b; background-color: #fff5f5;">
            <div class="glossary-title" style="color: #c53030;">5. 日本30Y国债：本土偏好回归（仅展示，不计权）</div>
            <div class="glossary-content">
                <span class="glossary-label">现象：</span> 日本长端收益率（30Y）抬升，但日元汇率未大幅升值。这是一种极其隐蔽的“慢性失血”。<br><br>
                <span class="glossary-label">替代效应逻辑：</span> <br>
                1. 以前日本养老金买美债是因为本土 0 利率。<br>
                2. 现在 JGB 长债收益率上升（~2-4%），对于保守资金来说，这是一个不需要承担汇率风险的完美收益。<br>
                3. <b>后果：</b> 日本资金停止出海，转投新发日债。全球债市（美/欧）失去最大边际买家，慢慢抽走全球流动性，导致近期美债长端收益率居高不下。
            </div>
        </div>
        """, unsafe_allow_html=True)
    
    st.markdown("<br>", unsafe_allow_html=True)
    with st.expander("📄 查看 原始数据明细"):
        st.dataframe(df_view.sort_index(ascending=False))
