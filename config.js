// GASバックエンド（doPost JSON API）のWebアプリURL。
// トークンはここには置かない（初回訪問時にユーザーが入力し、ブラウザの
// localStorageにのみ保存される。publicリポジトリにコミットされるのはこの
// ファイルだけなので、トークン自体はソースコードに残らない）。
const API_URL = 'https://script.google.com/macros/s/AKfycbxc3BTrX4vrSrCxYVEJkppLGuh5pL6iVEqPYwNqhvlT-rlGImeZNJPcpZvDZJ_TIUhoiw/exec';
