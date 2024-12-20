# raccoon-net-deploy-cfg-template
產生 raccoon 相關服務的 docker-compose.yaml 和 nginx 配置文件

## 建置方式
我們使用 [pake](https://github.com/tw93/Pake) 把本專案的靜態檔案建置成安裝檔

### 安裝 pake
```bash
npm install -g pake
```

### 建置安裝檔
```bash
pake ./index.html --name raccoon-net-cfg-tool --icon ./data/logo.png --use-local-file
```




