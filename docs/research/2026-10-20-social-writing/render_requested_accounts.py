from pathlib import Path
import json
import re
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.ticker import MaxNLocator
import numpy as np

root = Path(__file__).resolve().parent
posts = json.loads((root / 'requested-accounts-chart-data.json').read_text())['posts']
accounts = ['sumopodcloud', 'monveo.app', 'shobrunjb']
plt.rcParams.update({
    'font.family': 'DejaVu Sans', 'font.size': 10,
    'axes.titlesize': 13, 'axes.spines.top': False,
    'axes.spines.right': False, 'axes.spines.left': False,
    'axes.grid': False, 'svg.fonttype': 'none'
})
fig, axes = plt.subplots(2, 3, figsize=(19, 13.8), gridspec_kw={'height_ratios': [2.1, 1]})

def plotted_value(metric):
    if metric['value'] is not None:
        return metric['value']
    if metric['precision'] == 'rounded':
        match = re.fullmatch(r'([\d.]+)([KM])', metric['display'])
        if match:
            return float(match[1]) * {'K': 1000, 'M': 1000000}[match[2]]
        raise ValueError('Unknown rounded display')
    return 0

for col, account in enumerate(accounts):
    for row, platform in enumerate(['threads', 'instagram']):
        ax = axes[row, col]
        data = [p for p in posts if p['account'] == account and p['platform'] == platform]
        maximum = max([plotted_value(p[k]) for p in data for k in ['likes', 'responses']] + [1])
        y = np.arange(len(data))
        for shift, key, color, label in [(-.19, 'likes', '#1f627a', 'Likes'), (.19, 'responses', '#b15425', 'Comments / replies')]:
            values = [plotted_value(p[key]) for p in data]
            bars = ax.barh(y + shift, values, height=.32, color=color, label=label)
            for index, post in enumerate(data):
                metric = post[key]
                if metric['precision'] == 'rounded':
                    shown = '~' + metric['display']
                    bars[index].set_hatch('///')
                    bars[index].set_alpha(.65)
                else:
                    shown = 'not shown' if metric['value'] is None else str(metric['value'])
                ax.text(values[index] + maximum*.025, index + shift, shown, va='center', fontsize=10, color='#292929')
        ax.set_yticks(y, [f"{p['id']}  {p['topic']}\n{p['date']}" for p in data], fontsize=10)
        ax.invert_yaxis()
        ax.set_xlim(0, maximum*1.42)
        ax.xaxis.set_major_locator(MaxNLocator(nbins=6, integer=True))
        ax.set_title(f'@{account} | {platform.title()}', loc='left', fontweight='bold', pad=12)
        ax.tick_params(axis='y', length=0)
        ax.set_xlabel('Visible count (each panel has its own scale)', fontsize=9)
        ax.xaxis.grid(True, color='#e5e5e5')
        ax.set_axisbelow(True)

fig.suptitle('The three requested references: visible interactions', fontsize=23, fontweight='bold', x=.025, ha='left', y=.985)
fig.text(.025, .95, '22 posts captured on 20 October 2026 | Posts span August-October 2026, plus one May 2025 Instagram post', fontsize=12, color='#444444')
fig.legend(*axes[0,0].get_legend_handles_labels(), loc='upper right', bbox_to_anchor=(.985,.94), frameon=False, ncol=2)
fig.text(.025, .066,
    'Read reply quality alongside totals. Counts can include brand answers, criticism, keyword requests and unrelated promotions.\n'
    'Unknown counts are labeled; the hatched 1.4K bar is approximate. Ages, formats and audiences differ. No reach or conversion comparison is possible.\n'
    'Sumopod Instagram: only one old public post. Monveo brand Instagram: two very recent posts with explicit zeros at capture.',
    fontsize=11, color='#444444', linespacing=1.6)
fig.subplots_adjust(left=.14, right=.98, top=.88, bottom=.17, hspace=.36, wspace=.87)
fig.savefig(root / 'requested-accounts-interactions.png', dpi=170, facecolor='white')
fig.savefig(root / 'requested-accounts-interactions.svg', facecolor='white')
svg = root / 'requested-accounts-interactions.svg'
svg.write_text('\n'.join(line.rstrip() for line in svg.read_text().splitlines()) + '\n')
print('Created requested-accounts-interactions.png and .svg from 22 source records')
