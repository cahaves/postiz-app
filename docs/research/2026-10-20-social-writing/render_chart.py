from pathlib import Path
import json
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np
root=Path(__file__).resolve().parent
indo=json.loads((root/'indonesian-observations.json').read_text())['posts']
eng=json.loads((root/'english-observations.json').read_text())['records']
rows=[]
for r in indo:
 rows.append(dict(id=r['id'],account=r['account'],platform=r['platform'],date=r['published_at_utc'][:10],likes=r['likes'],comments=r['comments'] if r['platform']=='Instagram' else r['replies']))
for r in eng:
 rows.append(dict(id=r['sample_id'],account=r['account'],platform=r['platform'],date=r['published_at_utc'][:10],likes=r['metrics']['likes'],comments=r['metrics']['comments_or_replies']))
groups=[('nasihun.asp','Threads'),('paperindonesia','Instagram'),('buffer','Threads'),('buffer','Instagram'),('graha.nurdian','Threads'),('nathanbarry','Instagram')]
plt.rcParams.update({'font.family':'DejaVu Sans','font.size':10,'axes.titlesize':12,'axes.spines.top':False,'axes.spines.right':False,'axes.spines.left':False,'axes.grid':False,'svg.fonttype':'none'})
fig,axes=plt.subplots(3,2,figsize=(12,10.2))
for ax,(account,platform) in zip(axes.flat,groups):
 data=[r for r in rows if r['account']==account and r['platform']==platform]
 y=np.arange(len(data))
 for shift,field,color,label in [(-.18,'likes','#1f627a','Likes'),(.18,'comments','#b15425','Comments / replies')]:
  vals=[r[field] or 0 for r in data]
  ax.barh(y+shift,vals,height=.32,color=color,label=label)
  maxval=max([r[k] or 0 for r in data for k in ['likes','comments']]+[1])
  for i,r in enumerate(data):
   ax.text(vals[i]+maxval*.018,i+shift,'not visible' if r[field] is None else str(r[field]),va='center',fontsize=9,color='#292929')
 ax.set_yticks(y,[f"{r['id']}  {r['date']}" for r in data]);ax.invert_yaxis()
 ax.set_xlim(0,maxval*1.48);ax.set_title(f'@{account} · {platform}',loc='left',fontweight='bold',pad=10)
 ax.tick_params(axis='y',length=0);ax.set_xlabel('Visible count (panel scales differ)',fontsize=9)
 ax.xaxis.grid(True,color='#e5e5e5');ax.set_axisbelow(True)
fig.suptitle('Visible interactions across 18 public posts',fontsize=19,fontweight='bold',x=.035,ha='left',y=.985)
fig.text(.035,.947,'18 posts · Captured 20 October 2026 · Compare within accounts with caution',fontsize=12,color='#444444')
fig.legend(*axes[0,0].get_legend_handles_labels(),loc='upper right',bbox_to_anchor=(.98,.947),frameon=False,ncol=2)
fig.text(.035,.037,'Counts include author replies and may include repeated promotions. Missing labels are not zeros.\nPost age, media, reach, paid distribution and audience differ. See observations JSON for links and discrepancies.',fontsize=10,color='#444444',linespacing=1.5)
fig.subplots_adjust(left=.15,right=.97,top=.87,bottom=.13,hspace=.65,wspace=.45)
fig.savefig(root/'observed-interactions.png',dpi=170,facecolor='white')
fig.savefig(root/'observed-interactions.svg',facecolor='white')
svg = root / 'observed-interactions.svg'
svg.write_text('\n'.join(line.rstrip() for line in svg.read_text().splitlines()) + '\n')
print('Created observed-interactions.png and .svg from the 18 source records')
