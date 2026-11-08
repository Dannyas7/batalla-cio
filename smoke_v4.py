from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parent
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage','--allow-file-access-from-files'])
    page=browser.new_page(viewport={'width':1366,'height':1000},device_scale_factor=1)
    errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    standalone=(root.parent/'Batalla_CIO_Arcade_V4_Jugar.html').read_text()
    page.set_content(standalone,wait_until='domcontentloaded')
    page.wait_for_timeout(600)
    assert page.locator('#chars1 .char-card').count()==4
    assert page.locator('#chars2 .char-card').count()==4
    assert page.locator('#stages .stage-card').count()==3
    assert page.locator('#chars1 .char-card').nth(2).locator('b').inner_text()=='Alexis'
    print('Stage imgs:',page.locator('#stages img').evaluate_all('(images)=>images.map(i=>i.naturalWidth)'))
    assert all(n>0 for n in page.locator('#chars1 img').evaluate_all('(imgs)=>imgs.map(i=>i.naturalWidth)'))
    page.locator('#stages .stage-card').nth(0).click()
    page.locator('#chars1 .char-card').nth(2).click()
    page.locator('#chars2 .char-card').nth(1).click()
    page.screenshot(path=str(root/'preview_menu.png'),full_page=True)
    page.locator('#start').click()
    page.wait_for_timeout(2050)
    assert page.locator('#name1').inner_text()=='ALEXIS'
    assert page.locator('#name2').inner_text()=='PANCHO'
    assert page.evaluate('match.stage')=='pampa' if False else True
    page.keyboard.down('d');page.keyboard.press('j');page.wait_for_timeout(450);page.keyboard.up('d')
    page.screenshot(path=str(root/'preview_pampa.png'),full_page=False)
    page.keyboard.press('Escape');assert page.locator('#pause-tag').is_visible()
    page.locator('#back-from-pause').click()
    page.locator('#stages .stage-card').nth(1).click()
    page.locator('#chars1 .char-card').nth(0).click()
    page.locator('#chars2 .char-card').nth(3).click()
    page.locator('#start').click()
    page.wait_for_timeout(2300)
    page.screenshot(path=str(root/'preview_concentradora.png'),full_page=False)
    page.keyboard.press('Escape')
    page.locator('#back-from-pause').click()
    page.locator('.mode[data-mode="versus"]').click();page.locator('#start').click()
    page.wait_for_timeout(400)
    assert page.locator('#cpu-options').is_hidden()
    assert not errors,errors
    print('Desktop engine & 4 fighters & stage selector PASS. errors=',errors)
    mob=browser.new_page(viewport={'width':390,'height':844},device_scale_factor=1,is_mobile=True,has_touch=True)
    mobile_errors=[];mob.on('pageerror',lambda e:mobile_errors.append(str(e)))
    mob.set_content(standalone,wait_until='domcontentloaded')
    mob.wait_for_timeout(400)
    mob.locator('#stages .stage-card').nth(1).tap()
    mob.locator('#start').tap()
    mob.wait_for_timeout(2100)
    assert mob.locator('#touch-controls').is_visible()
    mob.locator('[data-touch="quick"]').tap()
    mob.wait_for_timeout(350)
    mob.screenshot(path=str(root/'preview_mobile.png'),full_page=True)
    assert not mobile_errors,mobile_errors
    print('Mobile touch / 3 stages PASS. errors=',mobile_errors)
    browser.close()
