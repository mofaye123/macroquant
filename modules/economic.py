import streamlit as st
import pandas as pd
import numpy as np
from data_engine import get_simple_macro_data

def render_economic(df_all=None):
    """
    调试模式：只展示原始数据表格
    """
    st.markdown("### 🛠️ 数据连接测试 (Data Debug Mode)")
    st.info("说明：TradingView 接口只能获取【实际值】，无法获取【预期值】。")

    if st.button("🔄 强制刷新"):
        st.cache_data.clear()
        st.rerun()

    with st.spinner('正在连接 TradingView...'):
        # 获取数据字典
        data_dict = get_simple_macro_data(bars=12)
    
    # 检查字典是否为空
    if not data_dict:
        st.error("❌ 抓取失败：完全没有数据返回。请检查网络或 library 安装。")
        return

    # === 展示表格 ===
    st.markdown("#### 📊 最新经济数据概览")
    
    # 构造一个汇总表
    summary_data = []
    
    for name, df in data_dict.items():
        if df is not None and not df.empty:
            # 最新值 (第0行)
            current_val = df['Actual'].iloc[0]
            current_date = df.index[0].strftime('%Y-%m-%d')
            
            # 前值 (第1行)
            if len(df) > 1:
                prev_val = df['Actual'].iloc[1]
            else:
                prev_val = None
                
            # 变动
            if prev_val is not None:
                change = current_val - prev_val
                change_str = f"{change:+.2f}"
            else:
                change_str = "-"
                
            status = "✅ 正常"
        else:
            current_val = prev_val = change_str = None
            current_date = "-"
            status = "❌ 无数据"
            
        summary_data.append({
            "指标名称": name,
            "发布日期": current_date,
            "最新值 (Actual)": current_val,
            "前值 (Previous)": prev_val,
            "变动 (Change)": change_str,
            "状态": status
        })
    
    # 转为 DataFrame 展示
    df_summary = pd.DataFrame(summary_data)
    
    # 设置索引
    df_summary = df_summary.set_index("指标名称")
    
    # 展示高亮表格
    st.dataframe(
        df_summary.style.format({
            "最新值 (Actual)": "{:.2f}",
            "前值 (Previous)": "{:.2f}"
        }).applymap(lambda v: 'color: red;' if v == '❌ 无数据' else '', subset=['状态']),
        use_container_width=True
    )

    st.divider()
    
    # === 详细历史数据 (Debug) ===
    with st.expander("🔍 查看详细历史数据 (Raw Data)"):
        st.write("以下是 TradingView 返回的原始数据，用于排查问题：")
        
        cols = st.columns(len(data_dict))
        for i, (name, df) in enumerate(data_dict.items()):
            with cols[i % 3]: # 每行放3个
                st.markdown(f"**{name}**")
                if df is not None:
                    st.dataframe(df.head(5)) # 只看前5行
                else:
                    st.warning("Empty")
