// 読み込み後に実行
var work; // グローバル変数として宣言 (各HTMLファイルで設定される)

// --- XSS対策用のヘルパー関数 ---
function escapeHtml(text) {
  var map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, function(m) { return map[m]; });
}

function unescapeHtml(text) {
  var map = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#039;': "'"
  };
  return text.replace(/&(amp|lt|gt|quot|#039);/g, function(m) { return map[m]; });
}

// XSSのPart.3の脆弱性再現用フィルタリング（限定的タグとその属性を許可）
function customXssFilter(text) {
  // まず、基本的なHTMLエスケープを行う
  let filteredText = escapeHtml(text);

  // 許可されたタグ（<b>, <i>, <s>, <u>）とその属性をunescapeすることで脆弱性を再現
  // タグ名と、その後に続く半角スペースと属性（例: onclick="..."）を許可
  // ただし、全ての属性を許可すると複雑になるため、ここでは限定的な属性タイプを例示
  // 今回の目的('onclick'を許容)のため、属性部分を広くマッチさせる
  filteredText = filteredText.replace(/&lt;b([^>]*)&gt;/g, (match, attrs) => {
      // 属性部分をunescape
      const unescapedAttrs = unescapeHtml(attrs); // 属性内の&quot;などを戻す
      return `<b${unescapedAttrs}>`;
  });
  filteredText = filteredText.replace(/&lt;\/b&gt;/g, '<b>');

  filteredText = filteredText.replace(/&lt;i([^>]*)&gt;/g, (match, attrs) => {
      const unescapedAttrs = unescapeHtml(attrs);
      return `<i${unescapedAttrs}>`;
  });
  filteredText = filteredText.replace(/&lt;\/i&gt;/g, '</i>');

  filteredText = filteredText.replace(/&lt;s([^>]*)&gt;/g, (match, attrs) => {
      const unescapedAttrs = unescapeHtml(attrs);
      return `<s${unescapedAttrs}>`;
  });
  filteredText = filteredText.replace(/&lt;\/s&gt;/g, '</s>');

  filteredText = filteredText.replace(/&lt;u([^>]*)&gt;/g, (match, attrs) => {
      const unescapedAttrs = unescapeHtml(attrs);
      return `<u${unescapedAttrs}>`;
  });
  filteredText = filteredText.replace(/&lt;\/u&gt;/g, '</u>');

  // スタイルタグやスクリプトタグは許可しない（エスケープされたまま）
  // 他の危険なタグ（script, style, iframe, imgなど）はエスケープされたまま

  return filteredText;
}

// HTML構文チェック（簡易版） - PHPのerror_checkに相当
function isHtmlValid(html) {
  // DOMParserを使って簡易的にチェック
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${html}</div>`, 'text/html');
  const errorNode = doc.querySelector('parsererror');
  return !errorNode;
}

// --- localStorage関連のデータ管理 ---
const LOCAL_STORAGE_KEY_PREFIX = "xss_chat_"; // work_numberごとにデータを区別

function getChatData(workNumber) {
  const key = LOCAL_STORAGE_KEY_PREFIX + workNumber;
  const data = localStorage.getItem(key);
  try {
    return data ? JSON.parse(data) : [];
  } catch (e) {
    console.error("Failed to parse chat data from localStorage:", e);
    return [];
  }
}

function saveChatData(workNumber, data) {
  const key = LOCAL_STORAGE_KEY_PREFIX + workNumber;
  localStorage.setItem(key, JSON.stringify(data));
}

// --- メインロジック ---
window.addEventListener("load", function() {
  // work変数は各HTMLファイル内の <script> タグで設定されることを前提
  if (typeof currentWork !== 'undefined') {
    work = currentWork;
  } else {
    console.warn("currentWork variable not defined in HTML. Defaulting to 0.");
    work = 0; 
  }

  // 途中保存の呼び起こし
  var savedMessage = localStorage.getItem("save_message_editor_" + work); // workごとに保存
  if(savedMessage !== null){
    document.getElementById("message").value = savedMessage;
  }

  chat_reload(); // ページ読み込み時にチャット履歴を読み込む
  bg(); // 背景色判定（work_1用）

  // work=0 の場合、他のworkのデータをロードして表示する
  if (work === 0) {
      displayAllWorkPosts();
  }
});

// メッセージエディタの内容を保存
function save(){
  var messageText = document.getElementById("message").value;
  localStorage.setItem("save_message_editor_" + work, messageText);
}

// メッセージ送信
function post(){
  var text = document.getElementById("message").value;
  // 全角の引用符を半角に変換
  text = text.replace(/‘/g,"\'");
  text = text.replace(/’/g,"\'");
  text = text.replace(/“/g,"\"");
  text = text.replace(/”/g,"\"");

  if(text === "" || text === null){
    return false; // 空のメッセージは送信しない
  }

  // 投稿データを準備
  const chatData = getChatData(work);
  const newPost = {
    post_id: Date.now().toString() + Math.random().toString(36).substr(2, 9), // 簡易的なユニークID
    name: "あなた", // 仮の名前
    date: new Date().toLocaleString(),
    text: text,
    work_number: work // どのworkで投稿されたかを記録
  };

  // データを保存
  chatData.push(newPost);
  saveChatData(work, chatData);

  document.getElementById("message").value = ""; // エディタをクリア
  localStorage.removeItem("save_message_editor_" + work); // 保存済みメッセージをクリア

  chat_reload(); // チャットを再表示
  bg(); // 背景色判定（work_1用）
  return false;
}

// メッセージ削除
function chat_delete(id){
  var result = confirm('本当に削除しますか？');
  if(result){
    let chatData = getChatData(work);
    chatData = chatData.filter(post => post.post_id !== id); // 該当IDの投稿を削除
    saveChatData(work, chatData); // 保存
    
    // work=0 の場合は、すべてのワークから削除を試みる
    if (work === 0) {
        for (let i = 1; i <= 3; i++) { // Part.1からPart.3までを対象
            let otherWorkData = getChatData(i);
            otherWorkData = otherWorkData.filter(post => post.post_id !== id);
            saveChatData(i, otherWorkData);
        }
        displayAllWorkPosts(); // 0ページ全体を再表示
    } else {
        chat_reload(); // 現在のワークを再表示
    }
    bg(); // 背景色判定（work_1用）
  }
  return false;
}

// チャット履歴の表示更新 (単一のwork用)
function chat_reload() {
  const reloadDiv = document.getElementById('reload');
  const chatData = getChatData(work);

  // 初期メッセージ（受信用）以外をクリア
  const initialReceiveDiv = reloadDiv.querySelector('.receive'); // 既存の最初のreceive divを保持
  reloadDiv.innerHTML = ''; // 一旦全てクリア
  if (initialReceiveDiv) {
      reloadDiv.appendChild(initialReceiveDiv); // 初期メッセージを再度追加
  }

  appendChatPosts(reloadDiv, chatData, work); // 指定されたworkの投稿を追加
  
  // スクロールを最下部へ
  var chatDisplay = document.getElementById("chat_display");
  if(chatDisplay) {
    chatDisplay.scrollTop = chatDisplay.scrollHeight;
  }
}

// 0_index.html 用: 全てのworkの投稿を表示する関数
function displayAllWorkPosts() {
    const reloadDiv = document.getElementById('reload');
    const allPosts = [];

    // Part.1からPart.3までのデータを収集
    for (let i = 1; i <= 3; i++) {
        const data = getChatData(i);
        // どのworkで投稿されたかを明確にするためのプロパティを追加
        data.forEach(post => {
            allPosts.push({ ...post, original_work_number: i });
        });
    }

    // 投稿日時でソート (古いものから新しいものへ)
    allPosts.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // 初期メッセージ以外をクリア
    const initialReceiveDiv = reloadDiv.querySelector('.receive');
    reloadDiv.innerHTML = '';
    if (initialReceiveDiv) {
        reloadDiv.appendChild(initialReceiveDiv);
    }

    // 全ての投稿を処理して表示
    allPosts.forEach(row => {
        const post_id = row.post_id;
        const text = row.text;
        const original_work_number = row.original_work_number;

        // Part.0では常にhtmlspecialchars相当の対策が適用される
        const displayHtml = escapeHtml(text);

        const postDiv = document.createElement('div');
        postDiv.classList.add('send'); // 常に送信側として表示

        postDiv.innerHTML = `
            <div>${nl2br(displayHtml)}</div>
            <div>&nbsp;</div>
            <div>この投稿は、<a href="../w${original_work_number}/">Part.${original_work_number}</a>で投稿されました。</div>
            <div><input name='delete' type='button' class='btn' onclick='chat_delete(\"${post_id}\");bg()' value='削除'></div>
        `;
        reloadDiv.appendChild(postDiv);
    });

    // スクロールを最下部へ
    var chatDisplay = document.getElementById("chat_display");
    if(chatDisplay) {
        chatDisplay.scrollTop = chatDisplay.scrollHeight;
    }
}


// 個々の投稿をDOMに追加するヘルパー関数
function appendChatPosts(containerDiv, chatData, workNumberForFilter) {
  chatData.forEach(row => {
    const post_id = row.post_id;
    const text = row.text;

    let displayHtml;
    let isError = false;

    // workNumberForFilter を使って、そのHTMLが属するworkのロジックを適用
    if (workNumberForFilter === 0) { // Part.0: 完全対策版
      displayHtml = escapeHtml(text); // 全てエスケープ
    } else if (workNumberForFilter === 1) { // Part.1: styleタグを許可する脆弱性（HTMLをそのまま表示）
      // PHPのerror_check(text)=="ERROR" 相当のチェックをJavaScriptで行う
      // <style>タグが閉じられていないなどの構文エラーを簡易的に検出
      if (!isHtmlValid(text)) {
        isError = true;
        displayHtml = escapeHtml(text); // エラーの場合はエスケープして表示
      } else {
        displayHtml = text; // 脆弱性のためそのまま表示
      }
    } else if (workNumberForFilter === 2) { // Part.2: scriptタグを許可する脆弱性（HTMLをそのまま表示）
        if (!isHtmlValid(text)) {
            isError = true;
            displayHtml = escapeHtml(text); // エラーの場合はエスケープして表示
        } else {
            displayHtml = text; // 脆弱性のためそのまま表示
        }
    } else if (workNumberForFilter === 3) { // Part.3: 特定のタグのみ許可する対策のすり抜け
      if (!isHtmlValid(text)) {
        isError = true;
        displayHtml = escapeHtml(text); // エラーの場合はエスケープして表示
      } else {
        displayHtml = customXssFilter(text); // 許可タグのみunescapeするフィルタリング
      }
    } else { // その他、デフォルトでエスケープ
      displayHtml = escapeHtml(text);
    }

    const postDiv = document.createElement('div');

    if (isError) {
      postDiv.classList.add('receive'); // エラーは受信側として表示
      postDiv.innerHTML = `
        <div>HTMLの構文が正しくないようです．</div>
        <div>資料を見直して，もう一度挑戦してみてください！</div>
        <div>&nbsp;</div>
        <div>&#9679あなたの投稿</div>
        <div>${nl2br(htmlspecialchars(text))}</div> <div><input name='delete' type='button' class='btn' onclick='chat_delete(\"${post_id}\");bg()' value='削除'></div>
      `;
    } else {
      postDiv.classList.add('send'); // 送信側として表示
      postDiv.innerHTML = `
        <div>${nl2br(displayHtml)}</div>
        <div><input name='delete' type='button' class='btn' onclick='chat_delete(\"${post_id}\");bg()' value='削除'></div>
      `;
    }
    containerDiv.appendChild(postDiv);
  });
}


// PHPのnl2brとhtmlspecialcharsのJS版ヘルパー（PHPコードから変換）
function nl2br(str) {
    return (str + '').replace(/([^>\r\n]?)(\r\n|\n\r|\r|\n)/g, '$1<br>$2');
}
function htmlspecialchars(str) { // これはあくまでXSS対策のデモ用
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
}


window.addEventListener("load",function() {
  disp();
})
window.addEventListener('DOMContentLoaded', function(){
  window.addEventListener('resize', function(){
    disp();
  });
});
function disp(){
  // bodyがflex-direction: column であり、
  // .title と .editor が固定高（flex-shrink: 0）で、
  // .chat (id="chat_bg") が flex-grow: 1 を持つ場合、
  // chat_display の高さは自動で調整されるため、直接計算は不要になることがあります。
  // ただし、jQuery版の名残の計算ロジックを保持する場合。

  // chat_display の高さをウィンドウ全体からタイトルとエディタの高さを引いたものにする
  // bodyにpaddingがある場合、それも考慮する必要がある
  var headerHeight = 60; // .titleの高さ
  var editorHeight = 120; // .editorの高さ
  var totalFixedElementsHeight = headerHeight + editorHeight;

  // window.innerHeight はビューポートの高さ
  // body に padding がある場合、それも考慮する必要がある
  var bodyStyle = getComputedStyle(document.body);
  var bodyPaddingTop = parseFloat(bodyStyle.paddingTop);
  var bodyPaddingBottom = parseFloat(bodyStyle.paddingBottom);
  var availableHeight = window.innerHeight - bodyPaddingTop - bodyPaddingBottom;

  var chatDisplayHeight = availableHeight - totalFixedElementsHeight;
  
  var chatDisplayElement = document.getElementById("chat_display");
  if(chatDisplayElement) {
       // Flexboxが自動調整するため、直接高さを設定するのはコメントアウト
       // chatDisplayElement.style.height = chatDisplayHeight + 'px';
  }

  // エディタの幅調整
  var e_m_element = document.getElementById("e_m");
  var chatEditorMessage = document.querySelector(".chat_editor_message");
  var sendImage = document.querySelector(".img[onclick='post()']"); 

  if(e_m_element && chatEditorMessage && sendImage) {
    var chatBgElement = document.getElementById("chat_bg");
    var chatWidth = chatBgElement ? chatBgElement.offsetWidth : window.innerWidth * 0.9; // chat_bgの実際の幅を取得、なければデフォルト
    
    var e_b_element = document.getElementById("e_b");
    var e_b_width = e_b_element ? e_b_element.offsetWidth : 100; // e_bの実際の幅を取得、なければデフォルト
    
    // .e_m は float: left; なので、残りの幅を計算して設定
    // 親要素 (.editor) の幅から .e_b の幅を引く
    e_m_element.style.width = (chatWidth - e_b_width - (parseFloat(getComputedStyle(e_m_element).paddingLeft) || 0) - (parseFloat(getComputedStyle(e_m_element).paddingRight) || 0)) + 'px'; 

    // chat_editor_message の幅は e_m の中に合わせて調整されるはず
  } else if (e_m_element) {
    // Fallback if elements not found, use previous logic or simplified calc
    e_m_element.style.width = (window.innerWidth * 0.9 - 100) + 'px'; 
  }
}
function copy() {
  var copyTarget = document.getElementById("c-base");
  if (copyTarget) {
      copyTarget.select();
      if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(copyTarget.value)
              .then(() => {
                var tempMessageArea = document.querySelector('.message-display') || document.createElement('div');
                tempMessageArea.textContent = 'リンクをコピーしました！';
                tempMessageArea.style.cssText = 'position:fixed; bottom:20px; left:50%; transform:translateX(-50%); background:rgba(0,0,0,0.7); color:white; padding:10px 20px; border-radius:5px; z-index:1000;';
                document.body.appendChild(tempMessageArea);
                setTimeout(() => tempMessageArea.remove(), 2000);
              })
              .catch(err => console.error('コピーに失敗しました', err));
      } else {
          // Fallback for older browsers
          document.execCommand("Copy");
          var tempMessageArea = document.querySelector('.message-display') || document.createElement('div');
          tempMessageArea.textContent = 'リンクをコピーしました！';
          tempMessageArea.style.cssText = 'position:fixed; bottom:20px; left:50%; transform:translateX(-50%); background:rgba(0,0,0,0.7); color:white; padding:10px 20px; border-radius:5px; z-index:1000;';
          document.body.appendChild(tempMessageArea);
          setTimeout(() => tempMessageArea.remove(), 2000);
      }
  }
}

// 送信(ALT + ENTER)
document.addEventListener('keydown', function(e) {
  const textEditor = document.querySelector(".chat_editor_message");
  if (textEditor && e.altKey && e.key === 'Enter') {
      e.preventDefault();
      post();
  }
});


// 色判定機能（work_1用）
function bg(){
  let box = document.getElementById('body_bg');
  let chatBg = document.getElementById('chat_bg');
  if (box && chatBg) {
    let GetBgColor = window.getComputedStyle(box, null).getPropertyValue('background-color');
    if(GetBgColor=="rgb(255, 255, 224)"){ // lightyellowのRGB値
      chatBg.style.backgroundColor = "deepskyblue";
    }
    else{
      chatBg.style.backgroundColor = GetBgColor;
    }
  }
}