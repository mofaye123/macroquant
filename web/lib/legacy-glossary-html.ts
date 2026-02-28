export const legacyGlossaryHtmlByModule: Record<string, string> = {
  'a': String.raw`<div class="glossary-box" style="border-left: 4px solid #6c5ce7; background-color: #f8f6ff;">
    <div class="glossary-title" style="color: #6c5ce7;">📊 核心量化模型逻辑 (Methodology)</div>
    <div class="glossary-content">
        本模块得分基于动量趋势 + 历史分位双重校验，满分 100 分（50分=中性）：<br>
        <b>1. 数据清洗：</b> 所有数据统一重采样为周频（Week-Ending Wednesday），剔除日间噪音。<br>
        <b>2. 趋势因子：</b> 采用 13周（即一个季度）的滚动变化量，捕捉中期流动性拐点。<br>
        <b>3. 历史打分：</b> 将当前趋势置于历史数据中进行百分位排名 (Percentile Rank)。例如得分 90 表示当前流动性环境优于历史上 90% 的时期。<br>
        <b>4. 处罚机制（总体逻辑）：</b><br>
        &nbsp;&nbsp;• <b>TGA 水位惩罚：</b> 当 TGA > 800B 开始惩罚，区间 0.8x / 0.6x / 0.5x；<br>
        &nbsp;&nbsp;• <b>TGA 趋势惩罚：</b> 观察 4 周变化，抽水加速则进一步下调；<br>
        &nbsp;&nbsp;• <b>流动性吸收惩罚：</b> 使用 (TGA+RRP) / WALCL 比例，比例越高则对 <b>Net Liquidity</b> 分数直接打折。<br>
        <b>5. TGA 打分口径：</b> <span class="glossary-label">Score_TGA = PercentileRank( -Δ13W(TGA) )</span>，即 TGA 13 周上行越快，得分越低；再叠加 TGA 水位惩罚系数。<br>
        <b>6. 权重模型：</b>
        <br>&nbsp;&nbsp;• <b>Fed净流动性 </b>：45% - 核心权重，代表真实购买力（且受吸收惩罚影响）。
        <br>&nbsp;&nbsp;• <b>TGA </b>：20% - 辅助权重，代表财政抽水压力。
        <br>&nbsp;&nbsp;• <b>RRP </b>：25% - 辅助权重，代表资金回流强弱。
        <br>&nbsp;&nbsp;• <b>银行准备金 </b>：10% - 基础权重，代表银行体系安全垫。
    </div>
</div>
<div class="glossary-box">
    <div class="glossary-title">图表解读：A模块得分 vs 流动性吸收 (TGA + RRP)</div>
    <div class="glossary-content">
        <span class="glossary-label">蓝线（吸收）上行：</span> 表示 TGA+RRP 吸收资金增加，市场可用流动性被抽走。<br>
        <span class="glossary-label">绿线（得分）下行：</span> 表示流动性环境走弱，风险上升。<br>
        <span class="glossary-label">关键信号：</span> 若蓝线持续走高而绿线仍高位，通常意味着<strong>惩罚尚未完全反映</strong>，需重点关注 TGA 惩罚与吸收惩罚是否继续加深。
    </div>
</div>
<div class="glossary-box">
    <div class="glossary-title">1. 银行准备金 (Bank Reserves / WRESBAL)</div>
    <div class="glossary-content">
        <span class="glossary-label">含义：</span> 商业银行存放在美联储的现金储备。<br>
        <span class="glossary-label">专业解读：</span> 这是金融体系的<b>“基础血液”</b>。它代表了银行体系内部可用的即时流动性。准备金越充裕，银行应对挤兑的能力越强，同时也具备更强的信贷扩张（放贷）潜力。
    </div>
    <div class="logic-row">
        <span class="bullish">⬆️ 上升 = 🟢 利好 (信贷扩张潜力增加)</span>
        <span class="bearish">⬇️ 下降 = 🔴 利空 (流动性缓冲变薄)</span>
    </div>
</div>
<div class="glossary-box">
    <div class="glossary-title">2. Fed 净流动性 (Net Liquidity)</div>
    <div class="glossary-content">
        <span class="glossary-label">含义：</span> 美联储资产负债表总规模 - (TGA账户余额 + ON RRP余额)。<br>
        <span class="glossary-label">专业解读：</span> 这是目前市场最关注的<b>“真实流动性”</b>指标。虽然美联储的总资产可能很高，但如果钱被锁在TGA（财政部）或ON RRP（逆回购）里，市场是拿不到这笔钱的。<br>
    </div>
    <div class="logic-row">
        <span class="bullish">⬆️ 上升 = 🟢 利好 (真实流动性增加)</span>
        <span class="bearish">⬇️ 下降 = 🔴 利空 (真实流动性收缩)</span>
    </div>
</div>
<div class="glossary-box">
    <div class="glossary-title">3. TGA (Treasury General Account)</div>
    <div class="glossary-content">
        <span class="glossary-label">含义：</span> 美国财政部在美联储的“存款账户”（政府的钱包）。<br>
        <span class="glossary-label">专业解读：</span> 这是一个<b>“流动性抽水机”</b>。当政府发债存钱或收税时，资金从市场流向 TGA（抽水）；当政府花钱时，资金回流市场（注水）。<br>
        <span class="glossary-label">实战阈值：</span><br>
        &nbsp;&nbsp;• <b>&lt; 4000亿美元：</b> 🟢 资金回流市场 (利好)<br>
        &nbsp;&nbsp;• <b>4000 - 8000亿：</b> ⚪ 中性震荡<br>
        &nbsp;&nbsp;• <b>&gt; 8000亿美元：</b> 🔴 流动性枯竭/回购紧缩风险 (利空)<br>
        <span class="glossary-label">关键规则：</span> 若 <b>TGA↑ 且 SOFR↑</b>，市场即入<b>危险区</b> (政府抽水+银行抢钱 = 崩盘前兆)。
    </div>
    <div class="logic-row">
        <span class="bearish">⬆️ 上升 = 🔴 利空 (资金被抽走)</span>
        <span class="bullish">⬇️ 下降 = 🟢 利好 (资金回流市场)</span>
    </div>
</div>
<div class="glossary-box">
    <div class="glossary-title">4. ON RRP 用量 (Overnight Reverse Repurchase Agreements)</div>
    <div class="glossary-content">
        <span class="glossary-label">含义：</span> 隔夜逆回购协议，即货币市场基金等机构把多余的现金借给美联储，换取利息。<br>
        <span class="glossary-label">专业解读：</span> 这是一个<b>“资金蓄水池”或“闲置资金停车场”</b>。当ON RRP用量很高时，说明市场上资金过剩但缺乏好的投资标的。
    </div>
    <div class="logic-row">
        <span class="bearish">⬆️ 上升 = 🔴 利空 (资金闲置/空转)</span>
        <span class="bullish">⬇️ 下降 = 🟢 利好 (资金重新激活)</span>
    </div>
</div>
<div class="glossary-box" style="border-left: 4px solid #888;">
    <div class="glossary-title">5. Fed 总资产 (Fed Total Assets) [仅展示]</div>
    <div class="glossary-content">
        <span class="glossary-label">含义：</span> 美联储资产负债表的总规模 (WALCL)。<br>
        <span class="glossary-label">专业解读：</span> 代表了央行资产负债表的扩张(QE)与收缩(QT)周期。它是大周期的水位，但短期对市场的影响常被 TGA/RRP 对冲。
    </div>
</div>`,
  'b': String.raw`<div class="glossary-box" style="border-left: 4px solid #6c5ce7; background-color: #f8f6ff;">
    <div class="glossary-title" style="color: #6c5ce7;">📊 核心量化模型逻辑 (Methodology)</div>
    <div class="glossary-content">
        本模块得分旨在量化资金成本与传导顺畅度，采用两层加权模型：<br>
        <b>总分 = 政策制度得分 (40%) + 摩擦压力得分 (60%)</b><br><br>
        <b>1. 政策制度 (Policy Regime)：</b> 
        <br>&nbsp;&nbsp; 结合利率绝对水平（低利率加分）与 13周变化趋势（降息趋势加分）。<br>
        <b>2. 摩擦压力 (Market Friction)：</b> 
        <br>&nbsp;&nbsp; <b>基准偏离度 (Z-Score思路)</b>：计算三组走廊摩擦相对其 60天移动中枢的偏离程度。
        <br>&nbsp;&nbsp; <b>非对称惩罚</b>：仅当 SOFR 突破天花板 (IORB) 时给予重罚，正常波动不扣分。
        <br>&nbsp;&nbsp; <b>动态权重 </b>：一旦监测到 SRF 用量激增，模型自动进入“非正常模式”，将 SRF 在摩擦压力权重从 0% 提至 60%，迅速拉低总分以发出警报。
    </div>
</div>
<div class="glossary-box">
    <div class="glossary-title">1. EFFR (联邦基金利率)</div>
    <div class="glossary-content">
        <span class="glossary-label">含义：</span> 无抵押隔夜资金价格 (政策锚)。<br>
        <span class="glossary-label">专业解读：</span> 这是美联储政策利率的“靶心”，代表了无风险的基准融资成本。
    </div>
    <div class="logic-row">
        <span class="bullish">⬇️ 下降 = 🟢 更松 (降息周期)</span>
        <span class="bearish">⬆️ 上升 = 🔴 更紧 (加息周期)</span>
    </div>
</div>

<div class="glossary-box">
    <div class="glossary-title">2. SOFR (担保隔夜融资利率)</div>
    <div class="glossary-content">
        <span class="glossary-label">含义：</span> 有抵押隔夜回购资金价格 (市场真实价格)。<br>
        <span class="glossary-label">专业解读：</span> 用国债做抵押借钱的成本。它是回购市场的核心定价基准。
    </div>
    <div class="logic-row">
        <span class="bullish">⬇️ 下降 = 🟢 更松 (资金成本下降)</span>
        <span class="bearish">⬆️ 上升 = 🔴 更紧 (资金成本上升)</span>
    </div>
</div>

<div class="glossary-box">
    <div class="glossary-title">3. IORB (准备金利息率)</div>
    <div class="glossary-content">
        <span class="glossary-label">含义：</span> 准备金利率 (政策天花板)。<br>
        <span class="glossary-label">专业解读：</span> 银行把钱存在美联储能拿到的无风险利息。理论上，银行不应以低于此利率把钱借给别人。
    </div>
    <div class="logic-row">
        <span class="bullish">⬇️ 下降 = 🟢 更松 (政策放松)</span>
        <span class="bearish">⬆️ 上升 = 🔴 更紧 (政策收紧)</span>
    </div>
</div>

<div class="glossary-box">
    <div class="glossary-title">4. RRP Award Rate (逆回购利率)</div>
    <div class="glossary-content">
        <span class="glossary-label">含义：</span> 逆回购利率 (政策地板)。<br>
        <span class="glossary-label">专业解读：</span> 机构把钱借给美联储能拿到的利息。这是市场利率的下限。
    </div>
    <div class="logic-row">
        <span class="bullish">⬇️ 下降 = 🟢 更松 (政策放松)</span>
        <span class="bearish">⬆️ 上升 = 🔴 更紧 (政策收紧)</span>
    </div>
</div>

<div class="glossary-box">
    <div class="glossary-title">5. SRF (常备回购便利)（正常时不计权）</div>
    <div class="glossary-content">
        <span class="glossary-label">含义：</span> 银行向美联储申请紧急贷款的金额 (Standing Repo Facility)。<br>
        <span class="glossary-label">专业解读：</span> 这是回购市场压力的<b>最重要实时信号</b>。监测银行是否启用了紧急贷款。<br>
        <span class="glossary-label">实战阈值：</span><br>
        &nbsp;&nbsp;• <b>&lt; 100亿美元：</b> 🟢 正常 (中性策略)<br>
        &nbsp;&nbsp;• <b>100 - 500亿美元：</b> 🟡 压力酝酿 (开始配置黄金/BTC)<br>
        &nbsp;&nbsp;• <b>&gt; 500亿美元：</b> 🔴 财政部失能 (准备迎接大放水救助/Risk On)
    </div>
    <div class="logic-row">
        <span class="bullish">⬇️ 用量低/零 = 🟢 更松 (资金充裕)</span>
        <span class="bearish">⬆️ 暴涨后崩盘 = 🟢 注入成功 (做多风险资产)</span>
    </div>
</div>

<div class="glossary-box">
    <div class="glossary-title">6. TGCR (第三方一般担保回购利率)</div>
    <div class="glossary-content">
        <span class="glossary-label">含义：</span> 三方回购一般抵押品利率。<br>
        <span class="glossary-label">专业解读：</span> 代表最标准、最优质的抵押品融资成本。
    </div>
    <div class="logic-row">
        <span class="bullish">⬇️ 下降 = 🟢 更松</span>
        <span class="bearish">⬆️ 上升 = 🔴 更紧</span>
    </div>
</div>

<div class="glossary-box">
    <div class="glossary-title">7. 走廊摩擦 1 (SOFR - IORB)</div>
    <div class="glossary-content">
        <span class="glossary-label">含义：</span> SOFR 相对于 IORB 的异常偏离 (穿顶监测)。<br>
        <span class="glossary-label">专业解读：</span> 只要 SOFR 冲破 IORB (正值)，就说明市场上的钱比央行的钱还贵，流动性告急。
    </div>
    <div class="logic-row">
        <span class="bullish">⬇️ 偏离度低 (负值) = 🟢 更松 (越负越好)</span>
        <span class="bearish">⬆️ 偏离度高 (正值) = 🔴 更紧 (极度紧缺)</span>
    </div>
</div>

<div class="glossary-box">
    <div class="glossary-title">8. 走廊摩擦 2 (SOFR - RRP)</div>
    <div class="glossary-content">
        <span class="glossary-label">含义：</span> SOFR 相对于地板的平均分布偏离 (离地监测)。<br>
        <span class="glossary-label">专业解读：</span> 监测资金是否开始脱离“地板区”。
    </div>
    <div class="logic-row">
        <span class="bullish">⬇️ 偏离度低 = 🟢 更松 (越贴近地板越好)</span>
        <span class="bearish">⬆️ 偏离度高 = 🔴 更紧 (开始收紧)</span>
    </div>
</div>

<div class="glossary-box">
    <div class="glossary-title">9. 抵押品/回购摩擦 (TGCR - SOFR)</div>
    <div class="glossary-content">
        <span class="glossary-label">含义：</span> 两条回购利率的分层/传导偏离。<br>
        <span class="glossary-label">专业解读：</span> 反映回购市场内部是否存在“血管堵塞”，资金传导是否顺畅。
    </div>
    <div class="logic-row">
        <span class="bullish">⬇️ 偏离度低 = 🟢 更松 (越接近0越好)</span>
        <span class="bearish">⬆️ 偏离度高 = 🔴 更紧 (传导不畅)</span>
    </div>
</div>`,
  'c': String.raw`<div class="glossary-box" style="border-left: 4px solid #6c5ce7; background-color: #f8f6ff;">
    <div class="glossary-title" style="color: #6c5ce7;">📊 核心量化模型逻辑 (Methodology)</div>
    <div class="glossary-content">
        C模块关注资金的时间价值与经济预期。算法包含三种逻辑：<br>
        <b>1. 绝对水平 (Level)：</b> 采用 <b>Percentile Rank</b>。名义利率越高，融资成本越贵，得分越低。<br>
        <b>2. 曲线形态 (Slope) - MID_BEST模型：</b> 曲线并非越陡越好。
        <br>&nbsp;&nbsp; <b>目标 (Target)</b>：利差 +50bps (0.5%) 视为最健康的“复苏/温和增长”形态。
        <br>&nbsp;&nbsp; <b>倒挂 (Inverted)</b>：利差 < 0，预示衰退，严重扣分。
        <br>&nbsp;&nbsp; <b>过陡 (Steep)</b>：利差 > 150bps，预示通胀失控或期限溢价过高，同样扣分。<br>
        <b>3. 动态惩罚 (Momentum Penalty) ：</b>
        <br>&nbsp;&nbsp; <b>逻辑</b>：利率的变化速度往往比绝对位置更致命。若长端利率在短期（60天）内暴涨，即便绝对水平尚可，也会引发资产定价的“休克”（杀估值）。
        <br>&nbsp;&nbsp; <b>机制</b>：监测 10Y/30Y 的 60天动量。若快速上行 (>30-50bps)，模型会自动触发 <b>0.2~0.8x 的折扣惩罚</b>，以反映市场的脆弱性。
    </div>
</div>

<div class="glossary-box">
    <div class="glossary-title">1. 10Y-2Y 利差 (The Yield Curve) - 权重 30%</div>
    <div class="glossary-content">
        <span class="glossary-label">含义：</span> 10年期利率减去2年期利率。<br>
        <span class="glossary-label">专业解读：</span> 全球第一的<b>“衰退预警指标”</b>。它反映了短端政策利率与长端增长预期的博弈。
    </div>
    <div class="logic-row">
        <span class="bullish">适度正斜率 (0-150bps) = 🟢 利好 (经济健康复苏)</span>
        <span class="bearish">负值倒挂 (<0bps) = 🔴 衰退预警 (央行紧缩过头)</span>
    </div>
</div>

<div class="glossary-box">
    <div class="glossary-title">2. 10Y-3M 利差 (Near-Term Forward Spread) - 权重 30%</div>
    <div class="glossary-content">
        <span class="glossary-label">含义：</span> 10年期利率减去3个月利率。<br>
        <span class="glossary-label">专业解读：</span> 相比10Y-2Y，美联储更看重这个指标。它直接对比了“当下现金成本”与“长期投资回报”。如果3个月利息比10年还高，银行放贷动力枯竭，信贷周期终结。
    </div>
    <div class="logic-row">
        <span class="bullish">曲线变陡 = 🟢 利好 (降息预期/复苏)</span>
        <span class="bearish">深度倒挂 = 🔴 衰退确认 (硬着陆风险极高)</span>
    </div>
</div>

<div class="glossary-box">
    <div class="glossary-title">3. 10Y 名义利率 (10Y Nominal Rate) - 权重 20%</div>
    <div class="glossary-content">
        <span class="glossary-label">含义：</span> 10年期国债收益率，全球资产定价之锚。<br>
        <span class="glossary-label">专业解读：</span> 它是DCF模型的分母。10Y利率上升，意味着未来的现金流折现到现在价值变低，直接杀估值（尤其是纳斯达克/成长股）。
    </div>
    <div class="logic-row">
        <span class="bullish">⬇️ 利率下行 = 🟢 利好 (估值扩张/分母变小)</span>
        <span class="bearish">⬆️ 利率上行 = 🔴 利空 (估值收缩/分母变大)</span>
    </div>
</div>

<div class="glossary-box">
    <div class="glossary-title">4. 2Y 名义利率 (2Y Nominal Rate) - 权重 10%</div>
    <div class="glossary-content">
        <span class="glossary-label">含义：</span> 对美联储未来政策路径最敏感的利率。<br>
        <span class="glossary-label">专业解读：</span> 2Y利率是美联储政策的“影子”。如果2Y利率暴涨，说明市场预期美联储将加息或维持高利率更久 (Higher for Longer)。
    </div>
    <div class="logic-row">
        <span class="bullish">⬇️ 利率下行 = 🟢 利好 (预期降息/Pivot)</span>
        <span class="bearish">⬆️ 利率上行 = 🔴 利空 (预期加息/紧缩)</span>
    </div>
</div>

<div class="glossary-box">
    <div class="glossary-title">5. 30Y 名义利率 (30Y Nominal Rate) - 权重 10%</div>
    <div class="glossary-content">
        <span class="glossary-label">含义：</span> 超长期限融资成本。<br>
        <span class="glossary-label">专业解读：</span> 反映了<b>“期限溢价”</b>和对美国财政赤字的担忧。如果30Y飙升，往往意味着市场担心美国发债太多或长期通胀失控。
    </div>
    <div class="logic-row">
        <span class="bullish">⬇️ 利率下行 = 🟢 利好 (通胀预期稳定)</span>
        <span class="bearish">⬆️ 利率上行 = 🔴 利空 (财政担忧/久期杀伤)</span>
    </div>
</div>`,
  'd': String.raw`<div class="glossary-box" style="border-left: 4px solid #6c5ce7; background-color: #f8f6ff;">
    <div class="glossary-title" style="color: #6c5ce7;">📊 核心量化模型逻辑 (Methodology)</div>
    <div class="glossary-content">
        D模块剥离了名义利率中的“水分”，直击资金最硬核的成本。<br>
        <b>1. 实际利率 (Real Rate)：</b> 公式为 <code>名义利率 - 通胀预期</code>。这是企业和个人经过通胀调整后的真实还款压力。该因子权重最高，且越低得分越高。<br>
        <b>2. 通胀预期 (Breakeven)：</b> 采用 <b>MID_BEST</b> 模型。
        <br>&nbsp;&nbsp; <b>目标 (Target)</b>：2.1% (美联储的长期目标)。
        <br>&nbsp;&nbsp; <b>失锚 (De-anchoring)</b>：如果预期跌破 1.5% (通缩/萧条) 或 突破 2.7% (通胀失控)，模型都会给予低分惩罚。
    </div>
</div>

<div class="glossary-box">
    <div class="glossary-title">1. 10Y 实际利率 (10Y Real Yield) - 权重 40%</div>
    <div class="glossary-content">
        <span class="glossary-label">含义：</span> TIPS (通胀保值债券) 的收益率。<br>
        <span class="glossary-label">专业解读：</span> 金融条件的标尺。因为名义利率高不可怕，如果通胀也高，实际还款压力其实不大。但如果“名义高、通胀低”（高实际利率），那就是对企业的最大绞杀。
    </div>
    <div class="logic-row">
        <span class="bullish">⬇️ 下行 (<0.5%) = 🟢 利好 (资金成本极低/刺激)</span>
        <span class="bearish">⬆️ 飙升 (>2.0%) = 🔴 利空 (强力紧缩/杀估值)</span>
    </div>
</div>

<div class="glossary-box">
    <div class="glossary-title">2. 5Y 实际利率 (5Y Real Yield) - 权重 30%</div>
    <div class="glossary-content">
        <span class="glossary-label">含义：</span> 中期真实融资成本。<br>
        <span class="glossary-label">专业解读：</span> 相比10Y，5Y实际利率对实体经济（如车贷、商业贷款）的敏感度更高。它是观察中期紧缩压力的窗口。
    </div>
    <div class="logic-row">
        <span class="bullish">⬇️ 下行 = 🟢 利好 (信贷需求恢复)</span>
        <span class="bearish">⬆️ 上行 = 🔴 利空 (实体经济承压)</span>
    </div>
</div>

<div class="glossary-box">
    <div class="glossary-title">3. 10Y Breakeven (盈亏平衡通胀率) - 权重 30%</div>
    <div class="glossary-content">
        <span class="glossary-label">含义：</span> 市场交易出来的未来10年平均通胀预期。<br>
        <span class="glossary-label">专业解读：</span> 美联储信誉的温度计。它不在于越低越好，而在于锚定。只要它稳定在 2.0%-2.5% 之间，美联储就敢降息（利好）；如果它失控飙升，美联储就必须加息杀通胀（利空）。
    </div>
    <div class="logic-row">
        <span class="bullish">锚定区间 (2.0-2.5%) = 🟢 中性利好 (央行掌控局面)</span>
        <span class="bearish">向上/向下失锚 = 🔴 双向利空 (通胀失控 or 通缩衰退)</span>
    </div>
</div>`,
  'e': String.raw`<div class="glossary-box" style="border-left: 4px solid #d97706; background-color: #fff8e1;">
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
</div>`,
  'f': String.raw`<div class="glossary-box" style="border-left: 4px solid #6c5ce7; background-color: #f8f6ff;">
    <div class="glossary-title" style="color: #6c5ce7;">📊 核心量化模型逻辑 (Methodology)</div>
    <div class="glossary-content">
        <b>F模块回答的问题：</b> “企业融资的压力有没有在明显变大？”<br><br>
        <b>为什么只用这两个因子？</b> 因为它们分别代表两个层级的信用压力：<br>
        &nbsp;&nbsp;• <b>HY Spread</b>：高风险企业融资成本（最敏感、最先动）。<br>
        &nbsp;&nbsp;• <b>BAA-10Y</b>：投资级企业融资成本（更稳态、覆盖更广）。<br>
        这对组合可以在不引入多重重复因子的情况下，覆盖“信用市场的快与慢”两条主线。<br><br>
        <b>打分方式：</b> 所有因子通过历史百分位映射到 <b>0-100</b>，并裁剪到有效区间。利差越高代表风险越大，因此 <b>Score = 100 - Percentile(Spread)</b>。<br>
        <b>权重：</b> HY水平 50% + HY趋势 30% + BAA稳态 20%。
    </div>
</div>

<div class="glossary-box">
    <div class="glossary-title">1. 高收益利差 (HY Spread) - 权重 50%</div>
    <div class="glossary-content">
        <span class="glossary-label">含义：</span> 垃圾债相对安全资产的风险溢价。<br>
        <span class="glossary-label">通俗解释：</span> 市场越害怕违约，垃圾债利差就越大。<br>
        <span class="glossary-label">专业解读：</span> 信用周期最敏感的温度计，通常在衰退前先行上行。
    </div>
    <div class="logic-row">
        <span class="bullish">⬇️ 下行 = 🟢 利好 (信用压力缓解)</span>
        <span class="bearish">⬆️ 上行 = 🔴 利空 (违约风险上升)</span>
    </div>
</div>

<div class="glossary-box">
    <div class="glossary-title">2. HY 利差趋势 (13周变化) - 权重 30%</div>
    <div class="glossary-content">
        <span class="glossary-label">含义：</span> 近 13 周利差的加速方向。<br>
        <span class="glossary-label">通俗解释：</span> 利差突然走阔，说明“信用压力在加速恶化”。<br>
        <span class="glossary-label">专业解读：</span> 捕捉信用风险的拐点和爆发阶段。
    </div>
    <div class="logic-row">
        <span class="bullish">⬇️ 收敛 = 🟢 利好 (压力减速)</span>
        <span class="bearish">⬆️ 扩大 = 🔴 利空 (风险加速)</span>
    </div>
</div>

<div class="glossary-box">
    <div class="glossary-title">3. BAA-10Y 利差 (Investment Grade Stress) - 权重 20%</div>
    <div class="glossary-content">
        <span class="glossary-label">含义：</span> 投资级信用利差相对国债。<br>
        <span class="glossary-label">通俗解释：</span> 就算是“好公司”，融资成本也在变贵。<br>
        <span class="glossary-label">专业解读：</span> 反映更广义、稳态的融资成本压力，避免 HY 单一波动过度主导。
    </div>
    <div class="logic-row">
        <span class="bullish">⬇️ 下行 = 🟢 利好 (稳态融资改善)</span>
        <span class="bearish">⬆️ 上行 = 🔴 利空 (融资环境收紧)</span>
    </div>
</div>`,
  'g': String.raw`<div class="glossary-box" style="border-left: 4px solid #6c5ce7; background-color: #f8f6ff;">
    <div class="glossary-title" style="color: #6c5ce7;">📊 核心量化模型逻辑 (Methodology)</div>
    <div class="glossary-content">
        <b>G模块回答的问题：</b> “市场更倾向冒险还是避险？”<br><br>
        <b>为什么选择这三个因子？</b> 因为它们分别代表风险偏好的三个层面：<br>
        &nbsp;&nbsp;• <b>VIX</b>：恐慌程度（情绪）<br>
        &nbsp;&nbsp;• <b>VIX/VXV</b>：短期恐慌是否突然升温（期限结构）<br>
        &nbsp;&nbsp;• <b>SPX动量</b>：风险偏好的价格验证（行为）<br><br>
        <b>打分方式：</b> 因子通过历史百分位映射到 <b>0-100</b> 并裁剪。数值越高代表风险越大，因此 <b>Score = 100 - Percentile</b>。<br>
        <b>权重：</b> 期限结构 40% + VIX 水平 30% + SPX 动量 30%。
    </div>
</div>

<div class="glossary-box">
    <div class="glossary-title">1. VIX (隐含波动率) - 权重 30%</div>
    <div class="glossary-content">
        <span class="glossary-label">含义：</span> 标普500期权隐含波动率。<br>
        <span class="glossary-label">通俗解释：</span> VIX 就像“市场恐惧指数”。越高越害怕。<br>
        <span class="glossary-label">专业解读：</span> 风险偏好下降最直观的信号。
    </div>
    <div class="logic-row">
        <span class="bullish">⬇️ 下行 = 🟢 利好 (恐慌缓解)</span>
        <span class="bearish">⬆️ 上行 = 🔴 利空 (避险情绪升温)</span>
    </div>
</div>

<div class="glossary-box">
    <div class="glossary-title">2. VIX/VXV (期限结构) - 权重 40%</div>
    <div class="glossary-content">
        <span class="glossary-label">含义：</span> 1个月波动率 / 3个月波动率。<br>
        <span class="glossary-label">通俗解释：</span> 比值 > 1 说明“短期恐慌”比“中期恐慌”更强。<br>
        <span class="glossary-label">专业解读：</span> 风险偏好恶化的核心信号，常伴随快速下跌。
    </div>
    <div class="logic-row">
        <span class="bullish">⬇️ 低于 1 = 🟢 利好 (结构稳定)</span>
        <span class="bearish">⬆️ 高于 1 = 🔴 利空 (短端恐慌)</span>
    </div>
</div>

<div class="glossary-box">
    <div class="glossary-title">3. SPX 动量 (风险资产趋势) - 权重 30%</div>
    <div class="glossary-content">
        <span class="glossary-label">含义：</span> 标普500近季度动量。<br>
        <span class="glossary-label">通俗解释：</span> 股市在涨，代表资金愿意冒险；下跌代表避险。<br>
        <span class="glossary-label">专业解读：</span> 价格层面的风险偏好验证。
    </div>
    <div class="logic-row">
        <span class="bullish">⬆️ 上行 = 🟢 利好 (风险偏好回升)</span>
        <span class="bearish">⬇️ 下行 = 🔴 利空 (风险偏好收缩)</span>
    </div>
</div>`,
};
