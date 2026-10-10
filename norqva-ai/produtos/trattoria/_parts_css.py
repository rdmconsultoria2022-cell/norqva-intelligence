CSS = f"""
@font-face{{font-family:'DSerif';src:url('file://{F}LiberationSerif-Regular.ttf');font-weight:400;font-style:normal}}
@font-face{{font-family:'DSerif';src:url('file://{F}LiberationSerif-Bold.ttf');font-weight:700;font-style:normal}}
@font-face{{font-family:'DSerif';src:url('file://{F}LiberationSerif-Italic.ttf');font-weight:400;font-style:italic}}
@font-face{{font-family:'DSerif';src:url('file://{F}LiberationSerif-BoldItalic.ttf');font-weight:700;font-style:italic}}
@font-face{{font-family:'DSans';src:url('file://{F}LiberationSans-Regular.ttf');font-weight:400}}
@font-face{{font-family:'DSans';src:url('file://{F}LiberationSans-Bold.ttf');font-weight:700}}
@font-face{{font-family:'DSans';src:url('file://{F}LiberationSans-Italic.ttf');font-weight:400;font-style:italic}}
:root{{--bg:#faf8f5;--ink:#1a1a1a;--gold:#9e7e4e;--gold-l:#b39a75;--rule:#e5dfd5;--box:#f2ece2;--gray:#595857;--green:#2f3a30;--dark:#161817}}
@page{{size:210mm 297mm;margin:0}}
*{{box-sizing:border-box;margin:0;padding:0}}
html,body{{background:var(--bg);color:var(--ink);-webkit-print-color-adjust:exact;print-color-adjust:exact}}
body{{font-family:'DSans',sans-serif;font-size:9.4pt;line-height:1.45}}
.page{{width:210mm;height:297mm;position:relative;overflow:hidden;background:var(--bg);page-break-after:always;break-after:page}}
.page:last-child{{page-break-after:auto;break-after:auto}}
.hdr{{position:absolute;top:9mm;left:16mm;right:16mm;height:7mm;border-bottom:.6pt solid var(--rule);display:flex;justify-content:space-between;align-items:flex-start}}
.hdr .l{{font-family:'DSerif';font-weight:700;font-size:6.6pt;letter-spacing:.32em;color:var(--gold);text-transform:uppercase}}
.hdr .r{{font-size:6.8pt;color:var(--gray);letter-spacing:.04em}}
.ftr{{position:absolute;bottom:9mm;left:16mm;right:16mm;border-top:.6pt solid var(--rule);padding-top:2.2mm;display:flex;justify-content:space-between}}
.ftr .l{{font-family:'DSerif';font-style:italic;font-size:7pt;color:var(--gray)}}
.ftr .r{{font-family:'DSerif';font-weight:700;font-size:7.6pt}}
.body{{position:absolute;top:21mm;bottom:20mm;left:16mm;right:16mm;overflow:hidden}}
.kicker{{font-family:'DSerif';font-weight:700;font-size:7pt;letter-spacing:.32em;color:var(--gold);text-transform:uppercase}}
.label{{font-family:'DSans';font-weight:700;font-size:6.8pt;letter-spacing:.16em;color:var(--gold);text-transform:uppercase}}
h1.big{{font-family:'DSerif';font-weight:400;font-size:25pt;line-height:1.1;margin:2mm 0 4mm;text-transform:uppercase}}
.lead{{font-family:'DSerif';font-style:italic;font-size:11pt;color:var(--gray);line-height:1.45}}
.sec{{font-family:'DSerif';font-weight:700;font-size:8pt;letter-spacing:.24em;color:var(--gold);text-transform:uppercase;border-bottom:.6pt solid var(--rule);padding-bottom:1.6mm;margin-bottom:2.6mm}}
p{{margin-bottom:2.4mm}}
.orn{{display:block;margin:0 auto}}
/* ---------- capa ---------- */
.cover{{background:var(--dark);color:#efe7da}}
.cover .frame{{position:absolute;inset:11mm;border:.7pt solid rgba(179,154,117,.55)}}
.cover .frame2{{position:absolute;inset:13mm;border:.4pt solid rgba(179,154,117,.3)}}
.cover .top{{position:absolute;top:30mm;left:0;right:0;text-align:center}}
.cover .brand{{font-family:'DSans';font-size:8.5pt;letter-spacing:.42em;color:var(--gold-l);margin-top:3mm}}
.cover .title{{position:absolute;top:78mm;left:0;right:0;text-align:center}}
.cover .t1{{font-family:'DSerif';font-size:44pt;letter-spacing:.06em;line-height:1;color:#f3ece0}}
.cover .t2{{font-family:'DSerif';font-style:italic;font-size:30pt;color:var(--gold-l);margin-top:3mm;letter-spacing:.02em}}
.cover .sub{{font-family:'DSerif';font-size:13.5pt;letter-spacing:.14em;text-transform:uppercase;color:#c9b28c;margin-top:9mm;line-height:1.5}}
.cover .menu{{position:absolute;top:168mm;left:42mm;right:42mm;border-top:.6pt solid rgba(179,154,117,.5);border-bottom:.6pt solid rgba(179,154,117,.5);padding:6mm 0;text-align:center;font-family:'DSerif';font-style:italic;font-size:11pt;line-height:1.9;color:#d8ccb8}}
.cover .menu b{{color:var(--gold-l);font-style:normal;font-weight:400;padding:0 2mm}}
.cover .bottom{{position:absolute;bottom:26mm;left:0;right:0;text-align:center}}
.cover .count{{font-family:'DSerif';font-size:10pt;letter-spacing:.3em;color:#efe7da}}
.cover .ed{{font-family:'DSans';font-weight:700;font-size:7.6pt;letter-spacing:.42em;color:var(--gold-l);margin-top:5mm}}
.cover .compl{{font-family:'DSerif';font-style:italic;font-size:9pt;color:#a99d8a;margin-top:2.5mm}}
/* ---------- sumário ---------- */
.toc{{margin-top:6mm;border-top:.6pt solid var(--rule)}}
.toc .row{{display:flex;align-items:baseline;border-bottom:.6pt solid var(--rule);padding:3.15mm 0}}
.toc .n{{font-family:'DSerif';font-size:15pt;width:16mm}}
.toc .t{{flex:1;font-weight:700;font-size:8.6pt;letter-spacing:.03em;text-transform:uppercase}}
.toc .t i{{font-family:'DSerif';font-weight:400;font-size:9pt;text-transform:none;letter-spacing:0;color:var(--gray);margin-left:2mm}}
.toc .p{{font-family:'DSerif';font-size:7.5pt;color:var(--gray);letter-spacing:.04em}}
.toc .grp{{padding:4.5mm 0 1.6mm;border-bottom:.6pt solid var(--rule)}}
/* ---------- receita ---------- */
.rtop{{display:flex;gap:7mm;align-items:flex-start}}
.rnum{{font-family:'DSerif';font-size:52pt;line-height:.9;color:var(--ink)}}
.rtitle{{font-family:'DSerif';font-weight:700;font-size:27pt;line-height:1.1;margin-top:.5mm}}
.rtag{{margin-top:2mm}}
.rintro{{font-family:'DSerif';font-style:italic;font-size:11pt;color:var(--gray);line-height:1.45;margin-top:2.6mm}}
.meta{{display:grid;grid-template-columns:1.25fr 1fr 1.1fr .7fr;border-top:.6pt solid var(--rule);border-bottom:.6pt solid var(--rule);margin:4.5mm 0 5mm}}
.meta>div{{padding:2.8mm 3mm 2.8mm 0}}
.meta>div+div{{padding-left:3.5mm;border-left:.6pt solid var(--rule)}}
.meta .v{{font-weight:700;font-size:9pt;line-height:1.3;margin-top:1.2mm}}
.cols{{display:grid;grid-template-columns:39% 1fr;gap:7mm}}
.ing h4{{font-family:'DSerif';font-style:italic;font-weight:400;font-size:10.8pt;color:var(--ink);margin:3.2mm 0 1.6mm}}
.ing h4:first-of-type{{margin-top:0}}
.ing ul{{list-style:none}}
.ing li{{position:relative;padding-left:3.6mm;margin-bottom:1.7mm;font-size:9.4pt;line-height:1.4;break-inside:avoid}}
.ing li:before{{content:'';position:absolute;left:0;top:1.9mm;width:1.3mm;height:1.3mm;background:var(--gold);transform:rotate(45deg)}}
.steps .st{{display:flex;gap:3mm;margin-bottom:3mm;break-inside:avoid}}
.steps .st .k{{font-family:'DSerif';font-weight:700;font-size:12.5pt;color:var(--gold);width:7mm;flex:none;line-height:1.15}}
.steps .st .x{{font-size:9.7pt;line-height:1.48}}
.tip{{background:var(--box);border-left:2.2pt solid var(--gold);padding:4.5mm 4.5mm;margin-top:6mm}}
.tip .label{{margin-bottom:1.4mm;display:flex;align-items:center;gap:2mm}}
.tip p{{font-family:'DSerif';font-style:italic;font-size:10.6pt;line-height:1.45;margin:0}}
.note{{border:.6pt solid var(--rule);background:#fff;padding:3mm 3.6mm;margin-top:3mm}}
.note .label{{margin-bottom:1mm}}
.note p{{font-size:8.9pt;line-height:1.42;margin:0}}
/**/.endorn{{position:absolute;left:0;right:0;bottom:2mm;text-align:center;font-family:'DSerif';font-style:italic;font-size:9pt;color:var(--gold)}}
.endorn div{{margin-top:1mm}}
.note.safe{{border-color:var(--gold-l)}}
/* ---------- geral ---------- */
.two{{display:grid;grid-template-columns:1fr 1fr;gap:8mm}}
.card{{background:var(--box);padding:5mm 6mm}}
.card h3{{font-family:'DSerif';font-weight:700;font-size:13pt;margin-bottom:2mm}}
.card p{{font-size:9.8pt;line-height:1.5;margin:0}}
.prose p{{font-size:10pt;line-height:1.55;margin-bottom:3.2mm}}
.prose .ing li{{font-size:10pt;margin-bottom:2.4mm}}
.prose .measures td{{font-size:9.6pt;padding:2.4mm 2mm 2.4mm 0}}
table.t{{width:100%;border-collapse:collapse;margin-top:2mm}}
table.t th{{font-family:'DSerif';font-weight:700;font-size:7pt;letter-spacing:.14em;text-transform:uppercase;color:var(--gold);text-align:left;padding:2mm 3mm 2mm 0;border-bottom:.6pt solid var(--rule)}}
table.t td{{font-size:9.3pt;padding:3.3mm 3mm 3.3mm 0;border-bottom:.6pt solid var(--rule);vertical-align:top;line-height:1.38}}
table.t td.n{{font-weight:700}}
table.t td.g{{color:var(--gold);font-weight:700}}
.panel{{background:var(--green);color:#efe7da;padding:8mm 7mm}}
.panel .q{{font-family:'DSerif';font-size:30pt;color:var(--gold-l);line-height:.6;height:7mm}}
.panel .qt{{font-family:'DSerif';font-style:italic;font-size:12pt;line-height:1.5}}
.panel .label{{color:var(--gold-l)}}
.panel hr{{border:0;border-top:.6pt solid rgba(179,154,117,.45);margin:6mm 0 4mm}}
.panel p{{font-size:8.6pt;line-height:1.5;color:#ddd5c6}}
.measures td{{font-size:8.6pt;padding:1.6mm 2mm 1.6mm 0;border-bottom:.6pt solid var(--rule)}}
.measures td:last-child{{text-align:right;font-weight:700}}
/* ---------- fotos ---------- */
.cover-photo{{background-size:cover;background-position:center 62%}}
.cover-photo .shade{{position:absolute;inset:0;background:linear-gradient(180deg,rgba(14,15,14,.93) 0%,rgba(14,15,14,.78) 30%,rgba(14,15,14,.15) 52%,rgba(14,15,14,0) 70%,rgba(14,15,14,.72) 88%,rgba(14,15,14,.92) 100%)}}
.opener .photo{{position:absolute;top:0;left:0;right:0;height:148mm;background-size:cover;background-position:center}}
.opener .photo:after{{content:'';position:absolute;left:0;right:0;bottom:0;height:.8mm;background:var(--gold)}}
.opener .obody{{position:absolute;top:160mm;left:20mm;right:20mm;bottom:22mm}}
.opener .onum{{font-family:'DSerif';font-size:64pt;line-height:.85;color:var(--gold)}}
.opener .otitle{{font-family:'DSerif';font-weight:700;font-size:34pt;line-height:1.08;margin-top:3mm}}
.opener .otag{{margin-top:3mm}}
.opener .ointro{{font-family:'DSerif';font-style:italic;font-size:13pt;line-height:1.5;color:var(--gray);margin-top:6mm;max-width:150mm}}
.opener .ometa{{display:flex;gap:9mm;margin-top:7mm;border-top:.6pt solid var(--rule);padding-top:3.5mm}}
.opener .ometa .v{{font-weight:700;font-size:9pt;margin-top:1mm}}
"""

