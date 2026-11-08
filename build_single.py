from pathlib import Path
import base64,json,re
root=Path(__file__).resolve().parent
fmt=lambda f: 'data:image/'+('webp' if f.suffix=='.webp' else 'png')+';base64,'+base64.b64encode(f.read_bytes()).decode('ascii')
images={x:fmt(root/'assets/portraits'/f'{x}.webp') for x in ('daniel','pancho','alexis','lucho')}
sprites={x:fmt(root/'assets/sprites'/f'{x}.png') for x in images}
stages={x:fmt(root/'assets/stages'/f'{x}.png') for x in ('pampa','concentradora')}
control=fmt(root/'cio_control_room.png')
js=(root/'game.js').read_text()
js='const PORTRAIT_DATA = '+json.dumps(images,separators=(',',':'))+';\nconst SPRITE_DATA = '+json.dumps(sprites,separators=(',',':'))+';\n'+js
# Keep assets entirely self-contained, including JS image constructors and HTML thumbnails
for name,uri in stages.items():
 js=js.replace('assets/stages/'+name+'.png',uri)
js=js.replace('cio_control_room.png',control)
js=js.replace('`assets/sprites/${f.id}.png`','SPRITE_DATA[f.id]')
js=js.replace('`assets/portraits/${person.id}.webp`','PORTRAIT_DATA[person.id]')
js=js.replace('`url(assets/portraits/${f.def.id}.webp)`','`url(${PORTRAIT_DATA[f.def.id]})`')
css=(root/'style.css').read_text().replace('cio_control_room.png',control)
css=re.sub(r"@import url\('https://fonts\.googleapis\.com[^;]+;",'',css)
html=(root/'index.html').read_text()
html=html.replace('<link rel="stylesheet" href="style.css">','<style>'+css+'</style>')
html=html.replace('<script src="combat-core.js"></script>','<script>'+(root/'combat-core.js').read_text()+'</script>')
html=html.replace('<script src="game.js"></script>','<script>'+js+'</script>')
target=root.parent/'Batalla_CIO_Arcade_V4_Jugar.html'
target.write_text(html)
print('Standalone created',target,format(target.stat().st_size/1024/1024,'.2f'),'MB')
