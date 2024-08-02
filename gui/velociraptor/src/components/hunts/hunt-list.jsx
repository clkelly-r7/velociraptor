import "./hunt.css";
import React from 'react';
import PropTypes from 'prop-types';
import _ from 'lodash';
import BootstrapTable from 'react-bootstrap-table-next';
import Navbar from 'react-bootstrap/Navbar';
import ButtonGroup from 'react-bootstrap/ButtonGroup';
import Button from 'react-bootstrap/Button';
import Modal from 'react-bootstrap/Modal';
import filterFactory from 'react-bootstrap-table2-filter';
import cellEditFactory from 'react-bootstrap-table2-editor';
import VeloTimestamp from "../utils/time.jsx";
import CreatableSelect from 'react-select/creatable';
import Form from 'react-bootstrap/Form';
import ToolTip from '../widgets/tooltip.jsx';
import Row from 'react-bootstrap/Row';
import Col from 'react-bootstrap/Col';

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { withRouter } from "react-router-dom";
import { formatColumns } from "../core/table.jsx";

import VeloForm from '../forms/form.jsx';
import VeloPagedTable from '../core/paged-table.jsx';
import { TablePaginationControl } from '../core/paged-table.jsx';

import NewHuntWizard from './new-hunt.jsx';
import DeleteNotebookDialog from '../notebooks/notebook-delete.jsx';
import ExportNotebook from '../notebooks/export-notebook.jsx';
import T from '../i8n/i8n.jsx';
import UserConfig from '../core/user.jsx';

import api from '../core/api-service.jsx';
import {CancelToken} from 'axios';

const SLIDE_STATES = [{
    level: "30%",
    icon: "arrow-down",
}, {
    level: "100%",
    icon: "arrow-up",
}, {
    level: "42px",
    icon: "arrows-up-down",
}];

const POLL_TIME = 5000;

class ModifyHuntDialog extends React.Component {
    static contextType = UserConfig;

    static propTypes = {
        hunt: PropTypes.object.isRequired,
        onCancel: PropTypes.func.isRequired,
        onResolve: PropTypes.func.isRequired,
    }

    state = {
        description: "",
        expires: "",
        tags: [],
    }

    getTags = ()=>{
        api.get("v1/GetHuntTags", {}, this.source.token).then(response=>{
                if (response && response.data &&
                    response.data.tags && response.data.tags.length) {
                    this.setState({tags: response.data.tags});
                };
        });
    }

    componentDidMount = () => {
        this.source = CancelToken.source();
        this.getTags();
    }

    componentWillUnmount() {
        this.source.cancel();
    }

    getExpiryEpoch = ()=>{
        let expires = this.props.hunt.expires / 1000000;
        if(this.state.expires) {
            expires = Date.parse(this.state.expires) / 1000;
        }
        return expires;
    }

    modifyHunt = ()=>{
        let hunt_id = this.props.hunt &&
            this.props.hunt.hunt_id;

        let description = this.state.description || this.props.hunt.hunt_description;
        let tags = this.state.tags || this.props.hunt.tags || [];

        if (!hunt_id) { return; };

        api.post("v1/ModifyHunt", {
            hunt_description: description,
            tags: tags,
            expires: this.getExpiryEpoch() * 1000000,
            hunt_id: hunt_id,
        }, this.source.token).then((response) => {
            this.props.onResolve();
        });
    }

    render() {
        let description = this.state.description || this.props.hunt.hunt_description;
        let expires = this.getExpiryEpoch();
        let now = Date.now() / 1000;

        let options = _.map(this.state.tags, x=>{
            return {value: x, label: x, isFixed: true, color: "#00B8D9"};
        });

        let tag_defaults = _.map(this.props.hunt.tags,
                             x=>{return {value: x, label: x};});

        return <Modal show={true}
                      onHide={this.props.onCancel} >
                 <Modal.Header closeButton>
                   <Modal.Title>{T("Modify Hunt")}</Modal.Title>
                 </Modal.Header>

                 <Modal.Body>
                   <Form.Group as={Row}>
                     <Form.Label column sm="3">
                       <ToolTip tooltip={T("Set Tags")}>
                         <div>
                           {T("Tags")}
                         </div>
                       </ToolTip>
                     </Form.Label>
                     <Col sm="8">
                       <CreatableSelect
                         isMulti
                         isClearable
                         className="labels"
                         classNamePrefix="velo"
                         options={options}
                         onChange={(e)=>{
                             this.setState({tags: _.map(e, x=>x.value)});
                         }}
                         placeholder={T("Hunt Tags")}
                         spellCheck="false"
                         defaultValue={tag_defaults}
                       />
                     </Col>
                   </Form.Group>
                   <VeloForm
                     param={{name: T("Description"), description: T("Hunt description")}}
                     value={description}
                     setValue={x=>this.setState({description:x})}
                   />
                   <VeloForm
                     param={{name: T("Expiry"), type: "timestamp",
                             description: T("Time hunt will expire")}}
                     value={expires}
                     setValue={x=>this.setState({expires:x})}
                   />
                 </Modal.Body>

                 <Modal.Footer>
                   <Button variant="secondary"
                           onClick={this.props.onCancel}>
                     {T("Close")}
                   </Button>
                   <Button variant="primary"
                           disabled={expires < now}
                           onClick={this.modifyHunt}>
                     {T("Run it!")}
                   </Button>
                 </Modal.Footer>
               </Modal>;
    }
}


class HuntList extends React.Component {
    static contextType = UserConfig;

    static propTypes = {
        selected_hunt: PropTypes.object,

        // Contain a list of hunt metadata objects - each summary of
        // the hunt.
        setSelectedHuntId: PropTypes.func,
        updateHunts: PropTypes.func,
        collapseToggle: PropTypes.func,

        // React router props.
        match: PropTypes.object,
        history: PropTypes.object,
    };

    componentDidMount = () => {
        this.source = CancelToken.source();

        let action = this.props.match && this.props.match.params &&
            this.props.match.params.hunt_id;
        if (action === "new") {
            let name = this.props.match && this.props.match.params &&
                this.props.match.params.tab;

            this.setState({
                showCopyWizard: true,
                full_selected_hunt: {
                    start_request: {
                        artifacts: [name],
                    },
                },
            });
            this.props.history.push("/hunts");
        }
        this.interval = setInterval(this.incrementVersion, POLL_TIME);

        let slider = SLIDE_STATES[this.state.slider];
        this.props.collapseToggle(slider.level);
    }

    componentWillUnmount() {
        this.source.cancel();
        clearInterval(this.interval);
    }

    incrementVersion = ()=>{
        this.setState({version: this.state.version+1});
        this.props.updateHunts();
    }

    state = {
        showWizard: false,
        showRunHuntDialog: false,
        showArchiveHuntDialog: false,
        showDeleteHuntDialog: false,
        showExportNotebook: false,
        showDeleteNotebook: false,
        showCopyWizard: false,
        showModifyHuntDialog: false,

        slider: 0,
        filter: "",
        selected_row: undefined,
        version: 1,
    }

    // Launch the hunt.
    setCollectionRequest = (request) => {
        api.post('v1/CreateHunt', request, this.source.token).then((response) => {
            // Keep the wizard up until the server confirms the
            // creation worked.
            this.setState({
                showWizard: false,
                showCopyWizard: false
            });

            // Refresh the hunts list when the creation is done.
            this.incrementVersion();
        });
    }

    startHunt = () => {
        let hunt_id = this.props.selected_hunt &&
            this.props.selected_hunt.hunt_id;

        if (!hunt_id) { return; };

        api.post("v1/ModifyHunt", {
            state: "RUNNING",
            hunt_id: hunt_id,
        }, this.source.token).then((response) => {
            this.incrementVersion();
            this.setState({ showRunHuntDialog: false });
        });
    }

    stopHunt = () => {
        let hunt_id = this.props.selected_hunt &&
            this.props.selected_hunt.hunt_id;

        if (!hunt_id) { return; };

        api.post("v1/ModifyHunt", {
            state: "PAUSED",
            hunt_id: hunt_id,
        }, this.source.token).then((response) => {
            this.incrementVersion();

            // Start Cancelling all in flight collections in the
            // background.
            api.post("v1/CollectArtifact", {
                client_id: "server",
                artifacts: ["Server.Utils.CancelHunt"],
                specs: [{
                    artifact: "Server.Utils.CancelHunt",
                    parameters: {
                        env: [
                            { key: "HuntId", value: hunt_id },
                        ]
                    }
                }],
            }, this.source.token);
        });
    }

    archiveHunt = () => {
        let hunt_id = this.props.selected_hunt &&
            this.props.selected_hunt.hunt_id;

        if (!hunt_id) { return; };

        api.post("v1/ModifyHunt", {
            state: "ARCHIVED",
            hunt_id: hunt_id,
        }, this.source.token).then((response) => {
            this.incrementVersion();
            this.setState({ showArchiveHuntDialog: false });
        });
    }

    updateHunt = (row) => {
        let hunt_id = row.hunt_id;

        if (!hunt_id) { return; };

        api.post("v1/ModifyHunt", {
            hunt_description: row.hunt_description || " ",
            hunt_id: hunt_id,
        }, this.source.token).then((response) => {
            this.incrementVersion();
        });
    }

    deleteHunt = () => {
        let hunt_id = this.props.selected_hunt &&
            this.props.selected_hunt.hunt_id;

        if (!hunt_id) { return; };

        // First stop the hunt then delete all the files.
        api.post("v1/ModifyHunt", {
            state: "ARCHIVED",
            hunt_id: hunt_id,
        }, this.source.token).then((response) => {
            this.incrementVersion();
            this.setState({ showDeleteHuntDialog: false });

            // Start delete collections in the background. It may take
            // a while.
            api.post("v1/CollectArtifact", {
                client_id: "server",
                artifacts: ["Server.Hunts.CancelAndDelete"],
                specs: [{
                    artifact: "Server.Hunts.CancelAndDelete",
                    parameters: {
                        env: [
                            { key: "HuntId", value: hunt_id },
                            { key: "DeleteAllFiles", value: "Y" },
                        ]
                    }
                }],
            }, this.source.token);
        });
    }

    setFullScreen = () => {
        if (this.props.selected_hunt) {
            this.props.history.push(
                "/fullscreen/hunts/" +
                this.props.selected_hunt.hunt_id + "/notebook");
        }
    }

    // this.props.selected_hunt is only a hunt summary so we need to
    // fetch the full hunt so we can copy it.
    copyHunt = () => {
        let hunt_id = this.props.selected_hunt &&
            this.props.selected_hunt.hunt_id;

        if (!hunt_id || hunt_id[0] !== "H") {
            return;
        }

        api.get("v1/GetHunt", {
            hunt_id: hunt_id,
        }, this.source.token).then((response) => {
            if (response.cancel) return;

            if (!_.isEmpty(response.data)) {
                this.setState({
                    full_selected_hunt: response.data,
                    showCopyWizard: true,
                });
            }
        });
    }

    expandSlider = ()=>{
        let next_slide = (this.state.slider + 1) % SLIDE_STATES.length;
        this.setState({ slider: next_slide});
        this.props.collapseToggle(SLIDE_STATES[next_slide].level);
    };

    render() {
        let selected_hunt = this.props.selected_hunt &&
            this.props.selected_hunt.hunt_id;
        let username = this.context &&
            this.context.traits && this.context.traits.username;
        const selectRow = {
            mode: "radio",
            clickToSelect: true,
            hideSelectColumn: true,
            classes: "row-selected",
            onSelect: (row) => {
                this.props.setSelectedHuntId(row["HuntId"]);
                this.setState({selected_row: row._id});
            },
            selected: [this.state.selected_row],
        };

        let state = this.props.selected_hunt && this.props.selected_hunt.state;
        if (this.props.selected_hunt.stats && this.props.selected_hunt.stats.stopped) {
            state = 'STOPPED';
        }

        let tab = this.props.match && this.props.match.params && this.props.match.params.tab;
        return (
            <>
              {this.state.showWizard &&
               <NewHuntWizard
                 onCancel={(e) => this.setState({ showWizard: false })}
                 onResolve={this.setCollectionRequest}
               />
              }
              {this.state.showCopyWizard &&
               <NewHuntWizard
                 baseHunt={this.state.full_selected_hunt}
                 onCancel={(e) => this.setState({ showCopyWizard: false })}
                 onResolve={this.setCollectionRequest}
               />
              }
              { this.state.showModifyHuntDialog &&
                <ModifyHuntDialog
                  onResolve={()=>{
                      this.incrementVersion();
                      this.setState({showModifyHuntDialog: false});
                  }}
                  onCancel={()=>this.setState({showModifyHuntDialog: false})}
                  hunt={this.props.selected_hunt}/>
              }
              {this.state.showRunHuntDialog &&
               <Modal show={this.state.showRunHuntDialog}
                      onHide={() => this.setState({ showRunHuntDialog: false })} >
                 <Modal.Header closeButton>
                   <Modal.Title>{T("Run this hunt?")}</Modal.Title>
                 </Modal.Header>

                 <Modal.Body>
                   <p>{T("Are you sure you want to run this hunt?")}</p>
                 </Modal.Body>

                 <Modal.Footer>
                   <Button variant="secondary"
                           onClick={() => this.setState({ showRunHuntDialog: false })}>
                     {T("Close")}
                   </Button>
                   <Button variant="primary"
                           onClick={this.startHunt}>
                     {T("Run it!")}
                   </Button>
                 </Modal.Footer>
               </Modal>
              }
              {this.state.showDeleteNotebook &&
               <DeleteNotebookDialog
                 notebook_id={"N." + selected_hunt}
                 onClose={e => {
                     this.setState({ showDeleteNotebook: false });
                     this.incrementVersion();
                 }} />
              }

              {this.state.showExportNotebook &&
               <ExportNotebook
                 notebook={{ notebook_id: "N." + selected_hunt }}
                 onClose={(e) => this.setState({ showExportNotebook: false })} />
              }

              {this.state.showDeleteHuntDialog &&
               <Modal show={true}
                      onHide={() => this.setState({ showDeleteHuntDialog: false })} >
                 <Modal.Header closeButton>
                   <Modal.Title>{T("Permanently delete this hunt?")}</Modal.Title>
                 </Modal.Header>

                 <Modal.Body>
                   {T("DeleteHuntDialog")}
                 </Modal.Body>

                 <Modal.Footer>
                   <Button variant="secondary"
                           onClick={() => this.setState({ showDeleteHuntDialog: false })}>
                     {T("Close")}
                   </Button>
                   <Button variant="primary"
                           onClick={this.deleteHunt}>
                     {T("Kill it!")}
                   </Button>
                 </Modal.Footer>
               </Modal>
              }

              <Navbar className="hunt-toolbar">
                <ButtonGroup>
                  <ToolTip tooltip={T("New Hunt")}>
                    <Button
                      onClick={() => this.setState({ showWizard: true })}
                      variant="default">
                      <FontAwesomeIcon icon="plus" />
                      <span className="sr-only">{T("New Hunt")}</span>
                    </Button>
                  </ToolTip>
                  <ToolTip tooltip={T("Modify Hunt")}>
                    <Button disabled={!selected_hunt}
                            onClick={() => this.setState({ showModifyHuntDialog: true })}
                            variant="default">
                      <FontAwesomeIcon icon="wrench" />
                      <span className="sr-only">{T("Modify Hunt")}</span>
                    </Button>
                  </ToolTip>
                  <ToolTip tooltip={T("Run Hunt")}>
                    <Button disabled={state !== 'PAUSED' && state !== 'STOPPED'}
                            onClick={() => this.setState({ showRunHuntDialog: true })}
                            variant="default">
                      <FontAwesomeIcon icon="play" />
                      <span className="sr-only">{T("Run Hunt")}</span>
                    </Button>
                  </ToolTip>
                  <ToolTip tooltip={T("Stop Hunt")}>
                    <Button disabled={state !== 'RUNNING'}
                            onClick={this.stopHunt}
                            variant="default">
                      <FontAwesomeIcon icon="stop" />
                      <span className="sr-only">{T("Stop Hunt")}</span>
                    </Button>
                  </ToolTip>
                  <ToolTip tooltip={T("Delete Hunt")}>
                    <Button disabled={state === 'RUNNING' || !selected_hunt}
                            onClick={() => this.setState({ showDeleteHuntDialog: true })}
                            variant="default">
                      <FontAwesomeIcon icon="trash-alt" />
                      <span className="sr-only">{T("Delete Hunt")}</span>
                    </Button>
                  </ToolTip>
                  <ToolTip tooltip={T("Copy Hunt")}>
                    <Button disabled={!selected_hunt}
                            onClick={this.copyHunt}
                            variant="default">
                      <FontAwesomeIcon icon="copy" />
                      <span className="sr-only">{T("Copy Hunt")}</span>
                    </Button>
                  </ToolTip>
                  <ToolTip tooltip={T("Stats Toggle")}>
                    <Button variant="default"
                            onClick={this.expandSlider}>
                      <FontAwesomeIcon
                        icon={SLIDE_STATES[this.state.slider].icon}/>
                    </Button>
                  </ToolTip>

                  { !this.state.filter ?
                    <ToolTip tooltip={T("Show only my hunts")}>
                      <Button onClick={()=>{
                                  this.setState({transform: {editing: "", filter_column: "Creator", filter_regex: username},
                                                 filter: username});
                                  this.incrementVersion();
                              }}
                              variant="default">
                        <FontAwesomeIcon icon="user" />
                        <span className="sr-only">{T("Show only my hunts")}</span>
                      </Button>
                    </ToolTip>
                    :
                    <ToolTip tooltip={T("Show all hunts")}>
                      <Button onClick={()=>{
                                  this.setState({transform: {}, filter: ""});
                                  this.incrementVersion();
                              }}
                              variant="default">
                        <FontAwesomeIcon icon="user-large-slash" />
                        <span className="sr-only">{T("Show all hunts")}</span>
                      </Button>
                    </ToolTip>
                  }
                </ButtonGroup>

                { this.state.page_state &&
                  <ButtonGroup>
                    <TablePaginationControl
                      total_size={this.state.page_state.total_size}
                      start_row={this.state.page_state.start_row}
                      page_size={this.state.page_state.page_size}
                      current_page={this.state.page_state.start_row /
                                    this.state.page_state.page_size}
                      onPageChange={this.state.page_state.onPageChange}
                      onPageSizeChange={this.state.page_state.onPageSizeChange}
                    />
                  </ButtonGroup> }

                {tab === "notebook" &&
                 <ButtonGroup className="float-right">
                   <ToolTip tooltip={T("Notebooks")}>
                     <Button disabled={true}
                             variant="outline-dark">
                       <FontAwesomeIcon icon="book" />
                       <span className="sr-only">{T("Notebooks")}</span>
                     </Button>
                   </ToolTip>
                   <ToolTip tooltip={T("Full Screen")}>
                     <Button onClick={this.setFullScreen}
                             variant="default">
                       <FontAwesomeIcon icon="expand" />
                       <span className="sr-only">{T("Full Screen")}</span>
                     </Button>
                   </ToolTip>
                   <ToolTip tooltip={T("Delete Notebook")} >
                     <Button onClick={() => this.setState({ showDeleteNotebook: true })}
                             variant="default">
                       <FontAwesomeIcon icon="trash" />
                       <span className="sr-only">{T("Delete Notebook")}</span>
                     </Button>
                   </ToolTip>
                   <ToolTip tooltip={T("Export Notebook")}  >
                     <Button onClick={() => this.setState({ showExportNotebook: true })}
                             variant="default">
                       <FontAwesomeIcon icon="download" />
                       <span className="sr-only">{T("Export Notebook")}</span>
                     </Button>
                   </ToolTip>
                 </ButtonGroup>
                }
              </Navbar>

                <div className="fill-parent no-margins toolbar-margin selectable">
                  <VeloPagedTable
                    url="v1/GetHuntTable"
                    params={{version: this.state.version}}
                    translate_column_headers={true}
                    prevent_transformations={{
                        State: true, Scheduled: true
                    }}
                    selectRow={selectRow}
                    version={{version: this.state.version}}
                    no_spinner={true}
                    transform={this.state.transform}
                    renderers={huntRowRenderer(this)}
                    setTransform={x=>{
                        this.setState({transform: x, filter: ""});
                    }}
                    no_toolbar={true}
                    name="HuntList"
                    setPageState={x=>this.setState({page_state: x})}
                  />
                </div>
            </>
        );
    }
};

export default withRouter(HuntList);

const stateRenderer = (cell, row) => {
    let result = <></>;

    if (cell === "STOPPED") {
        result = <FontAwesomeIcon icon="stop"/>;

    } else if (cell === "RUNNING") {
        result = <FontAwesomeIcon icon="hourglass"/>;

    } else if (cell === "PAUSED") {
        result = <FontAwesomeIcon icon="pause"/>;

    } else {
        result = <FontAwesomeIcon icon="exclamation"/>;
    }

    return <div className="flow-status-icon">{result}</div>;
};

const huntRowRenderer = self=>{
    return {
        State: stateRenderer,
        Created:  (cell, row) => {
            return <VeloTimestamp usec={cell}/>;
        },
        HuntId: (cell, row) => {
            return <div className="no-break">{cell}</div>;
        },
        Started:  (cell, row) => {
            if (cell === 0) {
                return <></>;
            }
            return <VeloTimestamp usec={cell}/>;
        },
        Expires:  (cell, row) => {
            return <VeloTimestamp usec={cell}/>;
        },
        Tags: (cell, row)=>{
            return _.map(cell, tag=>{
                return <Button variant="outline-info" key={tag}
                               onClick={x=>self.setState({
                                   transform: {
                                       editing: "",
                                       filter_column: "Tags",
                                       filter_regex: tag
                                   },
                               })}>
                         {tag}
                       </Button>;
            });
        },
    };
};
