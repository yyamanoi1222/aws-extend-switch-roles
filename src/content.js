import { createRedirectUri } from './lib/create_role_list_item.js'
function needsInvertForeColorByBack(color) {
  let r, g, b;
  const md = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
  if (md) {
    r = parseInt(md[1], 10);
    g = parseInt(md[2], 10);
    b = parseInt(md[3], 10);
  } else {
    r = parseInt(color.substr(0, 2), 16);
    g = parseInt(color.substr(2, 2), 16);
    b = parseInt(color.substr(4, 2), 16);
  }
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.5;
}

function adjustDisplayNameColor() {
  let menuBtn = document.querySelector('span[data-testid="account-menu-button__background"]');
  if (!menuBtn) {
    menuBtn = document.querySelector('#nav-usernameMenu .awsc-switched-role-username-wrapper');
  }
  if (menuBtn) {
    const bgColor = menuBtn.style.backgroundColor;
    if (bgColor && needsInvertForeColorByBack(bgColor)) {
      menuBtn.parentElement.style = 'color: #f9f9f9';
    }
  }
}

function appendAESR() {
  const form = document.createElement('form');
  form.id = 'AESR_form';
  form.method = 'POST';
  form.target = '_top';
  form.innerHTML = '<input type="hidden" name="mfaNeeded" value="0"><input type="hidden" name="action" value="switchFromBasis"><input type="hidden" name="src" value="nav"><input type="hidden" name="csrf"><input type="hidden" name="roleName"><input type="hidden" name="account"><input type="hidden" name="color"><input type="hidden" name="redirect_uri"><input type="hidden" name="displayName">';
  document.body.appendChild(form)

  const divInfo = document.createElement('div');
  divInfo.id = 'AESR_info';
  divInfo.style.display = 'none';
  divInfo.style.visibility = 'hidden';
  document.body.appendChild(divInfo);
}

let accountInfo = null;
function loadInfo(cb) {
  if (!accountInfo) {
    const script = document.createElement('script');
    script.src = chrome.extension.getURL('/js/attach_target.js');
    script.onload = function() {
      const json = document.getElementById('AESR_info').dataset.content;
      accountInfo = JSON.parse(json);
      cb(accountInfo);
      this.remove();
    };
    document.body.appendChild(script);
    return true;
  } else {
    cb(accountInfo);
    return false;
  }
}

function setupMessageListener(metaASE) {
  (chrome || browser).runtime.onMessage.addListener(function(msg, sender, cb) {
    const { data, action } = msg;
    if (action === 'loadInfo') {
      return loadInfo(cb);
    } else if (action === 'switch') {
      switchRole(metaASE, data)
      return false;
    }
  })
}

function switchRole(metaASE, data) {
  let actionHost = metaASE.getAttribute('content');
  const { actionSubdomain } = data;
  if (actionSubdomain && actionHost === 'signin.aws.amazon.com') {
    actionHost = actionSubdomain + '.' + actionHost;
  }
  const form = document.getElementById('AESR_form');
  form.setAttribute('action', `https://${actionHost}/switchrole`);
  form.account.value = data.account;
  form.color.value = data.color;
  form.roleName.value = data.rolename;
  form.displayName.value = data.displayname;
  form.redirect_uri.value = data.redirecturi;
  form.submit();
}

if (document.body) {
  const metaASE = document.getElementById('awsc-signin-endpoint');
  if (metaASE) {
    adjustDisplayNameColor();
    appendAESR();
    setupMessageListener(metaASE);

    (async () => {
      const afterAutoSwitchUrl = await new Promise(r => {
        chrome.storage.sync.get(['after-auto-switch-url'], (d) => {
          r(d['after-auto-switch-url'])
        })
      })

      if (afterAutoSwitchUrl) {
        chrome.storage.sync.set({'after-auto-switch-url': null })
        window.location.href = afterAutoSwitchUrl
      }

      const autoSwitchData = await new Promise(r => {
        chrome.storage.sync.get(['auto-switch-data'], (d) => {
          r(d['auto-switch-data'])
        })
      })

      if (autoSwitchData) {
        chrome.storage.sync.set({'auto-switch-data': null })
        const { profile ,role_name: rolename, aws_account_id: account ,color, afterSwitchUrl } = autoSwitchData
        const displayname =  profile + '  |  ' + account
        loadInfo((info) => {
          if (info.userAccountNumber.replace(/-/g, '') == account && info.roleDisplayNameUser == rolename) {
            return
          }

          chrome.storage.sync.set({'after-auto-switch-url': afterSwitchUrl })

          switchRole(metaASE, {
            profile,
            rolename,
            account,
            color: color || "aaaaaa",
            redirecturi: createRedirectUri(window.location.href, 'ap-northeast-1', 'ap-northeast-1'),
            displayname,
            search: rolename,
          });
        });
      }
    })();
  }
}
